"""
Sentiment analysis: fetch news for ticker, run FinBERT, return headlines and 0–100 score.
Uses NewsData.io, NewsAPI, and NewsAPI.ai (not Yahoo Finance) plus Hugging Face FinBERT.
"""
import logging
import os
from datetime import UTC, datetime, timedelta
from typing import Any, List

import requests
from dotenv import load_dotenv

logger = logging.getLogger(__name__)
analysis_logger = logging.getLogger("analysis")

NEWSAPIAI_ARTICLE_SEARCH_URL = "https://eventregistry.org/api/v1/article/getArticles"
NEWSAPIAI_REALTIME_LOOKBACK_DAYS = 2

# Lazy load FinBERT to avoid heavy import at Django startup
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


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default
    try:
        return int(value.strip())
    except ValueError:
        return default


def _build_news_queries(ticker: str, stock_name: str | None) -> list[str]:
    """Build a stable, unique query list (ticker first, then company name if distinct)."""
    queries: list[str] = []
    for candidate in [ticker, stock_name]:
        value = (candidate or "").strip()
        if not value:
            continue
        if value.lower() in {q.lower() for q in queries}:
            continue
        queries.append(value)
    return queries


def _parse_published_at(value: Any) -> datetime:
    """Parse provider timestamp variants into timezone-aware UTC datetime."""
    raw = (value or "").strip()
    if not raw:
        return datetime.min.replace(tzinfo=UTC)

    normalized = raw.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)
    except ValueError:
        # Fallback for YYYY-MM-DD style values.
        try:
            return datetime.strptime(raw, "%Y-%m-%d").replace(tzinfo=UTC)
        except ValueError:
            return datetime.min.replace(tzinfo=UTC)


def _analyze_with_finbert(headlines: List[str]) -> float:
    """
    Analyze a list of headlines and return a weighted sentiment score scaled to 0–100.
    Under the hood FinBERT gives labels in {-1, 0, 1}, we average and map -1..1 → 0..100.
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

    # Map -1..1 to 0..100 (e.g. -1→0, 0→50, 1→100)
    return round(50 + 50 * max(-1.0, min(1.0, avg)), 1)



def _load_keys() -> tuple[str | None, str | None, str | None, bool]:
    """Load sentiment provider API keys and feature flags from .env/environment."""
    load_dotenv()
    newsdata_key = os.getenv("NEWSDATAIO_API_KEY")
    newsapi_key = os.getenv("NEWS_API_KEY")
    newsapi_ai_key = os.getenv("NEWSAPIAI_API_KEY")
    enable_newsapi_ai = _env_bool("ENABLE_NEWSAPIAI", default=False)
    if not newsdata_key:
        logger.warning("NEWSDATAIO_API_KEY not set; NewsData.io results will be skipped.")
    if not newsapi_key:
        logger.warning("NEWS_API_KEY not set; NewsAPI results will be skipped.")
    if enable_newsapi_ai and not newsapi_ai_key:
        logger.warning(
            "ENABLE_NEWSAPIAI is true but NEWSAPIAI_API_KEY is not set; "
            "NewsAPI.ai results will be skipped."
        )
    return newsdata_key, newsapi_key, newsapi_ai_key, enable_newsapi_ai


def _fetch_from_newsdataio(ticker: str, stock_name: str | None, api_key: str) -> list[dict[str, Any]]:
    """Fetch headlines from NewsData.io by ticker and stock name."""
    url = "https://newsdata.io/api/1/latest"
    headlines: list[dict[str, Any]] = []

    for query in _build_news_queries(ticker, stock_name):
        try:
            q = f"${query}" if query.upper() == ticker.upper() else query
            params = {
                "apikey": api_key,
                "q": q,
                "language": "en",
                "removeduplicate": 1,
            }
            res = requests.get(url, params=params, timeout=10)
            data = res.json()
            if data.get("status") == "success":
                for art in data.get("results", [])[:50]:
                    title = art.get("title") or ""
                    if not title:
                        continue
                    headlines.append(
                        {
                            "title": title,
                            "link": art.get("link") or art.get("url") or "",
                            "source": art.get("source_id") or art.get("creator") or "NewsData.io",
                            "apiSource": "NewsData.io",
                            "publishedAt": art.get("pubDate") or art.get("publishedAt") or "",
                        }
                    )
        except Exception as e:
            logger.warning("NewsData.io error for query %s: %s", query, e)

    return headlines


def _fetch_from_newsapi(ticker: str, stock_name: str | None, api_key: str) -> list[dict[str, Any]]:
    """Fetch headlines from NewsAPI.org by ticker and stock name."""
    url = "https://newsapi.org/v2/everything"
    headlines: list[dict[str, Any]] = []

    for query in _build_news_queries(ticker, stock_name):
        try:
            params = {
                "q": query,
                "apiKey": api_key,
                "language": "en",
                "sortBy": "publishedAt",
                "pageSize": 50,
            }
            res = requests.get(url, params=params, timeout=10)
            data = res.json()
            for art in data.get("articles", [])[:50]:
                title = art.get("title") or ""
                if not title:
                    continue
                headlines.append(
                    {
                        "title": title,
                        "link": art.get("url") or "",
                        "source": (art.get("source") or {}).get("name") or "NewsAPI",
                        "apiSource": "NewsAPI",
                        "publishedAt": art.get("publishedAt") or "",
                    }
                )
        except Exception as e:
            logger.warning("NewsAPI error for query %s: %s", query, e)

    return headlines


def _fetch_from_newsapi_ai(ticker: str, stock_name: str | None, api_key: str) -> list[dict[str, Any]]:
    """Fetch headlines from NewsAPI.ai using article search only (not event search)."""
    url = NEWSAPIAI_ARTICLE_SEARCH_URL
    headlines: list[dict[str, Any]] = []

    # Guardrail: never call event search due to higher cost.
    normalized_url = url.lower()
    if "/event/" in normalized_url or "searchevents" in normalized_url:
        logger.error(
            "NewsAPI.ai endpoint misconfigured to event search (%s); skipping expensive call.",
            url,
        )
        return headlines

    for query in _build_news_queries(ticker, stock_name):
        try:
            lookback_days = max(
                0,
                _env_int("NEWSAPIAI_LOOKBACK_DAYS", NEWSAPIAI_REALTIME_LOOKBACK_DAYS),
            )
            date_start = (datetime.now(UTC) - timedelta(days=lookback_days)).date().isoformat()
            params = {
                "apiKey": api_key,
                "keyword": query,
                "lang": "eng",
                "articlesSortBy": "date",
                "articlesSortByAsc": "false",
                "articlesCount": 50,
                "articlesPage": 1,
                "resultType": "articles",
                "dateStart": date_start,
                "dataType": "news",
            }
            res = requests.get(url, params=params, timeout=10)
            data = res.json()
            for art in ((data.get("articles") or {}).get("results") or [])[:50]:
                title = art.get("title") or ""
                if not title:
                    continue
                source_obj = art.get("source") or {}
                source_name = (
                    source_obj.get("title")
                    if isinstance(source_obj, dict)
                    else "NewsAPI.ai"
                )
                headlines.append(
                    {
                        "title": title,
                        "link": art.get("url") or "",
                        "source": source_name or "NewsAPI.ai",
                        "apiSource": "NewsAPI.ai",
                        "publishedAt": (
                            art.get("dateTimePub")
                            or art.get("dateTime")
                            or art.get("date")
                            or ""
                        ),
                    }
                )
        except Exception as e:
            logger.warning("NewsAPI.ai error for query %s: %s", query, e)

    return headlines


def get_sentiment_analysis(
    ticker: str,
    stock_name: str | None = None,
    max_news: int = 100,
) -> dict[str, Any] | None:
    """
    Fetch latest news for ticker from NewsData.io, NewsAPI, and optional NewsAPI.ai,
    run FinBERT on titles,
    and return list of headlines with an overall sentiment score (0–100).
    """
    try:
        ticker = ticker.upper().strip()
        newsdata_key, newsapi_key, newsapi_ai_key, enable_newsapi_ai = _load_keys()

        if stock_name:
            stock_name = stock_name.strip()
        if not stock_name:
            stock_name = ticker

        newsdata_headlines: list[dict[str, Any]] = []
        newsapi_headlines: list[dict[str, Any]] = []
        newsapi_ai_headlines: list[dict[str, Any]] = []

        if newsdata_key:
            newsdata_headlines = _fetch_from_newsdataio(ticker, stock_name, newsdata_key)
        if newsapi_key:
            newsapi_headlines = _fetch_from_newsapi(ticker, stock_name, newsapi_key)
        if enable_newsapi_ai and newsapi_ai_key:
            newsapi_ai_headlines = _fetch_from_newsapi_ai(ticker, stock_name, newsapi_ai_key)

        raw_headlines: list[dict[str, Any]] = (
            newsdata_headlines + newsapi_headlines + newsapi_ai_headlines
        )

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
            "SENTIMENT_FETCH_COUNTS ticker=%s newsdata=%d newsapi=%d newsapi_ai=%d raw_total=%d unique_total=%d latest=%s",
            ticker,
            len(newsdata_headlines),
            len(newsapi_headlines),
            len(newsapi_ai_headlines),
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

        # Run FinBERT batch analysis
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

        # If per-headline analysis failed, still produce basic headline list
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
        logger.exception("get_sentiment_analysis failed for %s: %s", ticker, e)
        return None
