import logging
import os
from datetime import UTC, datetime, timedelta
from typing import Any, List

import requests
from dotenv import load_dotenv

logger = logging.getLogger(__name__)
analysis_logger = logging.getLogger("analysis")

FINNHUB_COMPANY_NEWS_URL = "https://finnhub.io/api/v1/company-news"
FINNHUB_DEFAULT_LOOKBACK_DAYS = 3

_finbert_pipeline = None


def _get_finbert():
    global _finbert_pipeline
    if _finbert_pipeline is None:
        try:
            from transformers import pipeline

            _finbert_pipeline = pipeline(
                "sentiment-analysis",
                model="ProsusAI/finbert",
                truncation=True,
                max_length=512,
            )
        except Exception as e:
            logger.warning("FinBERT not available: %s. Using fallback neutral score.", e)
    return _finbert_pipeline


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value.strip())
    except ValueError:
        return default


def _parse_published_at(value: Any) -> datetime:
    """Parse timestamp into timezone-aware UTC datetime."""
    if value is None:
        return datetime.min.replace(tzinfo=UTC)

    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value, tz=UTC)
        except (OverflowError, OSError, ValueError):
            return datetime.min.replace(tzinfo=UTC)

    raw = str(value).strip()
    if not raw:
        return datetime.min.replace(tzinfo=UTC)

    normalized = raw.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)
    except ValueError:
        try:
            return datetime.strptime(raw, "%Y-%m-%d").replace(tzinfo=UTC)
        except ValueError:
            return datetime.min.replace(tzinfo=UTC)


def _analyze_with_finbert(headlines: List[str]) -> float:
    """
    Analyze a list of headlines and return a weighted sentiment score scaled to 0–100.
    FinBERT gives labels in {-1, 0, 1}; we average and map -1..1 → 0..100.
    """
    if not headlines:
        return 50.0

    pipe = _get_finbert()
    if not pipe:
        return 50.0

    try:
        results = pipe(headlines)
    except Exception as e:
        logger.warning("FinBERT batch analysis failed: %s", e)
        return 50.0

    score_map = {"positive": 1, "negative": -1, "neutral": 0}
    total = 0.0
    count = 0
    for res in results:
        label = (res.get("label") or "").lower()
        if label == "neutral":
            continue
        conf = float(res.get("score") or 0.0)
        base = score_map.get(label, 0)
        total += base * conf
        count += 1

    if not count:
        return 50.0

    avg = total / count  # -1..1
    return round(50 + 50 * max(-1.0, min(1.0, avg)), 1)


def _load_finnhub_key() -> str | None:
    """Load Finnhub API key from environment or .env."""
    load_dotenv()
    api_key = os.getenv("FINNHUB_API_KEY")
    if not api_key:
        logger.warning("FINNHUB_API_KEY not set; Finnhub company news will be skipped.")
    return api_key


def _fetch_from_finnhub(
    ticker: str,
    stock_name: str | None,
    api_key: str,
) -> list[dict[str, Any]]:
    """
    Fetch company-specific news from Finnhub for the given ticker.

    Finnhub company-news endpoint:
        GET /api/v1/company-news
        params: symbol, from, to, token
    """
    url = FINNHUB_COMPANY_NEWS_URL
    headlines: list[dict[str, Any]] = []

    lookback_days = max(
        0,
        _env_int("FINNHUB_LOOKBACK_DAYS", FINNHUB_DEFAULT_LOOKBACK_DAYS),
    )
    today = datetime.now(UTC).date()
    date_from = (today - timedelta(days=lookback_days)).isoformat()
    date_to = today.isoformat()

    try:
        params = {
            "symbol": ticker,
            "from": date_from,
            "to": date_to,
            "token": api_key,
        }
        res = requests.get(url, params=params, timeout=10)
        res.raise_for_status()
        data = res.json() or []

        for art in data[:200]:
            title = art.get("headline") or ""
            if not title:
                continue

            ts = art.get("datetime")
            published_at = ""
            try:
                if ts is not None:
                    dt = _parse_published_at(ts)
                    published_at = dt.isoformat()
            except Exception:
                published_at = ""

            headlines.append(
                {
                    "title": title,
                    "link": art.get("url") or "",
                    "source": art.get("source") or "Finnhub",
                    "apiSource": "Finnhub",
                    "publishedAt": published_at,
                }
            )
    except Exception as e:
        logger.warning("Finnhub error for ticker %s: %s", ticker, e)

    return headlines


def get_sentiment_analysis(
    ticker: str,
    stock_name: str | None = None,
    max_news: int = 100,
) -> dict[str, Any] | None:
    """
    Fetch latest company news for ticker from Finnhub,
    run FinBERT on titles,
    and return list of headlines with an overall sentiment score (0–100).
    """
    try:
        ticker = ticker.upper().strip()
        api_key = _load_finnhub_key()

        if stock_name:
            stock_name = stock_name.strip()
        if not stock_name:
            stock_name = ticker

        finnhub_headlines: list[dict[str, Any]] = []

        if api_key:
            finnhub_headlines = _fetch_from_finnhub(ticker, stock_name, api_key)

        raw_headlines: list[dict[str, Any]] = finnhub_headlines

        # Remove duplicate titles
        seen_titles = set()
        unique_headlines: list[dict[str, Any]] = []
        for h in raw_headlines:
            title = h.get("title") or ""
            key = title.strip().lower()
            if not key or key in seen_titles:
                continue
            seen_titles.add(key)
            unique_headlines.append(h)

        unique_headlines.sort(
            key=lambda h: _parse_published_at(h.get("publishedAt")),
            reverse=True,
        )

        latest_timestamp = unique_headlines[0].get("publishedAt", "") if unique_headlines else ""
        analysis_logger.info(
            "SENTIMENT_FETCH_COUNTS ticker=%s finnhub=%d raw_total=%d unique_total=%d latest=%s",
            ticker,
            len(finnhub_headlines),
            len(raw_headlines),
            len(unique_headlines),
            latest_timestamp,
        )

        if not unique_headlines:
            return {
                "headlines": [],
                "score": 50.0,
                "data": {"symbol": ticker, "count": 0},
            }

        # Limit to max_news for analysis
        limited = unique_headlines[:max_news]
        titles_for_model = [h["title"] for h in limited]

        pipe = _get_finbert()
        per_headline = []
        if pipe and titles_for_model:
            try:
                results = pipe(titles_for_model)
                for h, res in zip(limited, results):
                    per_headline.append(
                        {
                            "title": h["title"],
                            "link": h.get("link", ""),
                            "source": h.get("source", ""),
                            "apiSource": h.get("apiSource", "unknown"),
                            "publishedAt": h.get("publishedAt", ""),
                            "sentiment": res.get("label", "neutral"),
                            "sentimentScore": round(float(res.get("score", 0.0)), 3),
                        }
                    )
            except Exception as e:
                logger.warning("FinBERT per-headline analysis failed: %s", e)

        if not per_headline:
            per_headline = [
                {
                    "title": h["title"],
                    "link": h.get("link", ""),
                    "source": h.get("source", ""),
                    "apiSource": h.get("apiSource", "unknown"),
                    "publishedAt": h.get("publishedAt", ""),
                    "sentiment": "neutral",
                    "sentimentScore": 0.0,
                }
                for h in limited
            ]

        overall = _analyze_with_finbert([h["title"] for h in limited])

        return {
            "data": {
                "symbol": ticker,
                "count": len(per_headline),
            },
            "headlines": per_headline,
            "score": overall,
        }
    except Exception as e:
        logger.exception("get_sentiment_analysis (Finnhub) failed for %s: %s", ticker, e)
        return None

