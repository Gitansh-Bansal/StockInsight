"""
Sentiment analysis: fetch news for ticker, run FinBERT, return headlines and 0-100 score.
Uses Finnhub as primary source, with NewsData.io, NewsAPI, and NewsAPI.ai as fallback.
"""
import logging
import os
import re
import threading
import unicodedata
from datetime import UTC, datetime, timedelta
from difflib import SequenceMatcher
from typing import Any, List
from urllib.parse import urlsplit, urlunsplit

import requests
from dotenv import load_dotenv

logger = logging.getLogger(__name__)
analysis_logger = logging.getLogger("analysis")

FINNHUB_COMPANY_NEWS_URL = "https://finnhub.io/api/v1/company-news"
FINNHUB_DEFAULT_LOOKBACK_DAYS = 3

NEWSAPIAI_ARTICLE_SEARCH_URL = "https://eventregistry.org/api/v1/article/getArticles"
NEWSAPIAI_REALTIME_LOOKBACK_DAYS = 2

# Lazy load FinBERT to avoid heavy import at Django startup
_finbert_pipeline = None
_finbert_lock = threading.Lock()
_inference_lock = threading.Lock()


def _get_finbert():
    global _finbert_pipeline
    if _finbert_pipeline is not None:
        return _finbert_pipeline

    # Ensure only one thread performs the first model load.
    with _finbert_lock:
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


def preload_finbert_model() -> bool:
    """Warm FinBERT weights once for this Django process."""
    return _get_finbert() is not None


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
    """
    Build a stable, unique query list for provider searches.
    Includes ticker variants (for exchange suffixes like .NS/.BO) and stock name.
    """
    queries: list[str] = []
    ticker_value = (ticker or "").strip()
    ticker_core = re.split(r"[.:/]", ticker_value, maxsplit=1)[0].strip()

    candidates: list[str | None] = [ticker_value]
    if ticker_core and ticker_core.lower() != ticker_value.lower():
        candidates.append(ticker_core)
    candidates.append(stock_name)

    for candidate in candidates:
        value = (candidate or "").strip()
        if not value:
            continue
        if value.lower() in {q.lower() for q in queries}:
            continue
        queries.append(value)
    return queries


def _normalize_title_for_dedupe(title: str) -> str:
    """
    Normalize headline text for duplicate detection.
    Includes light synonym collapsing for common market wording variants.
    """
    text = unicodedata.normalize("NFKC", title or "").strip().lower()
    if not text:
        return ""

    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    synonym_map = {
        "shares": "stock",
        "stocks": "stock",
    }
    tokens = [synonym_map.get(tok, tok) for tok in text.split()]
    return " ".join(tokens)


def _normalize_link_for_dedupe(link: str) -> str:
    """Normalize URL so tracking/query differences do not bypass dedupe."""
    raw = (link or "").strip()
    if not raw:
        return ""

    try:
        parsed = urlsplit(raw)
        scheme = (parsed.scheme or "https").lower()
        netloc = parsed.netloc.lower()
        if netloc.startswith("www."):
            netloc = netloc[4:]
        path = re.sub(r"/+$", "", parsed.path or "")
        return urlunsplit((scheme, netloc, path, "", ""))
    except Exception:
        return raw.lower()


def _published_minute_key(value: Any) -> str:
    """Build a minute-level timestamp key; empty string when unavailable."""
    dt = _parse_published_at(value)
    if dt.year <= 1:
        return ""
    return dt.replace(second=0, microsecond=0).isoformat()


def _parse_published_at(value: Any) -> datetime:
    """Parse provider timestamp variants into timezone-aware UTC datetime."""
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
        # Fallback for YYYY-MM-DD style values.
        try:
            return datetime.strptime(raw, "%Y-%m-%d").replace(tzinfo=UTC)
        except ValueError:
            return datetime.min.replace(tzinfo=UTC)


def _analyze_with_finbert(headlines: List[str]) -> float:
    """
    Analyze a list of headlines and return a weighted sentiment score scaled to 0-100.
    Under the hood FinBERT gives labels in {-1, 0, 1}, we average and map -1..1 to 0..100.
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

    # Map -1..1 to 0..100 (e.g. -1->0, 0->50, 1->100)
    return round(50 + 50 * max(-1.0, min(1.0, avg)), 1)


def _load_keys() -> tuple[str | None, str | None, str | None, str | None, bool]:
    """Load API keys and feature flags from .env/environment."""
    load_dotenv()

    finnhub_key = os.getenv("FINNHUB_API_KEY")
    newsdata_key = os.getenv("NEWSDATAIO_API_KEY")
    newsapi_key = os.getenv("NEWS_API_KEY")
    newsapi_ai_key = os.getenv("NEWSAPIAI_API_KEY")
    enable_newsapi_ai = _env_bool("ENABLE_NEWSAPIAI", default=False)

    if not finnhub_key:
        logger.warning("FINNHUB_API_KEY not set; Finnhub company news will be skipped.")
    if not newsdata_key:
        logger.warning("NEWSDATAIO_API_KEY not set; NewsData.io results will be skipped.")
    if not newsapi_key:
        logger.warning("NEWS_API_KEY not set; NewsAPI results will be skipped.")
    if enable_newsapi_ai and not newsapi_ai_key:
        logger.warning(
            "ENABLE_NEWSAPIAI is true but NEWSAPIAI_API_KEY is not set; "
            "NewsAPI.ai results will be skipped."
        )

    return finnhub_key, newsdata_key, newsapi_key, newsapi_ai_key, enable_newsapi_ai


def _fetch_from_finnhub(
    ticker: str,
    api_key: str,
) -> tuple[list[dict[str, Any]], bool]:
    """Fetch company-specific news from Finnhub for the given ticker."""
    url = FINNHUB_COMPANY_NEWS_URL
    headlines: list[dict[str, Any]] = []
    provider_failed = False

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
        data: Any = res.json() or []

        if isinstance(data, dict):
            error_message = (data.get("error") or data.get("message") or "").strip()
            if error_message:
                provider_failed = True
                logger.warning("Finnhub returned error for ticker %s: %s", ticker, error_message)
                return [], provider_failed

            # Defensive handling: some APIs wrap lists in a top-level key.
            data = data.get("data") or data.get("result") or []

        if not isinstance(data, list):
            provider_failed = True
            logger.warning(
                "Finnhub returned unexpected payload type for ticker %s: %s",
                ticker,
                type(data).__name__,
            )
            return [], provider_failed

        for art in data[:200]:
            if not isinstance(art, dict):
                continue
            title = art.get("headline") or ""
            if not title:
                continue

            ts = art.get("datetime")
            published_at = ""
            try:
                if ts is not None:
                    published_at = _parse_published_at(ts).isoformat()
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
        provider_failed = True
        logger.warning("Finnhub error for ticker %s: %s", ticker, e)

    # print(headlines)

    return headlines, provider_failed


def _fetch_from_newsdataio(ticker: str, stock_name: str | None, api_key: str) -> list[dict[str, Any]]:
    """Fetch headlines from NewsData.io by ticker and stock name."""
    url = "https://newsdata.io/api/1/latest"
    headlines: list[dict[str, Any]] = []

    for query in _build_news_queries(ticker, stock_name):
        try:
            params = {
                "apikey": api_key,
                "q": query,
                "language": "en",
                "removeduplicate": 1,
            }
            res = requests.get(url, params=params, timeout=10)
            res.raise_for_status()
            data = res.json()
            status = (data.get("status") or "").strip().lower()
            if status and status != "success":
                logger.warning(
                    "NewsData.io non-success for query %s: status=%s message=%s",
                    query,
                    data.get("status"),
                    data.get("message") or data.get("error"),
                )
                continue

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
            res.raise_for_status()
            data = res.json()
            if (data.get("status") or "").strip().lower() == "error":
                logger.warning(
                    "NewsAPI non-success for query %s: code=%s message=%s",
                    query,
                    data.get("code"),
                    data.get("message"),
                )
                continue

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
            res.raise_for_status()
            data = res.json()

            error_message = ""
            if isinstance(data, dict):
                err = data.get("error")
                if isinstance(err, str):
                    error_message = err.strip()
                elif isinstance(err, dict):
                    error_message = str(err.get("message") or err.get("error") or "").strip()

            if error_message:
                logger.warning("NewsAPI.ai non-success for query %s: %s", query, error_message)
                continue

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
    max_news: int = 200,
) -> dict[str, Any] | None:
    """
    Fetch latest news for ticker with Finnhub as primary source.
    If Finnhub fails or returns nothing, fallback to NewsData.io + NewsAPI + optional NewsAPI.ai.
    Run FinBERT on titles and return headlines with an overall sentiment score (0-100).
    """
    try:
        ticker = ticker.upper().strip()
        finnhub_key, newsdata_key, newsapi_key, newsapi_ai_key, enable_newsapi_ai = _load_keys()

        if stock_name:
            stock_name = stock_name.strip()
        if not stock_name:
            stock_name = ticker

        finnhub_headlines: list[dict[str, Any]] = []
        finnhub_failed = False
        newsdata_headlines: list[dict[str, Any]] = []
        newsapi_headlines: list[dict[str, Any]] = []
        newsapi_ai_headlines: list[dict[str, Any]] = []

        if finnhub_key:
            finnhub_headlines, finnhub_failed = _fetch_from_finnhub(ticker, finnhub_key)

        fallback_used = finnhub_failed or len(finnhub_headlines) == 0
        if fallback_used:
            if newsdata_key:
                newsdata_headlines = _fetch_from_newsdataio(ticker, stock_name, newsdata_key)
            if newsapi_key:
                newsapi_headlines = _fetch_from_newsapi(ticker, stock_name, newsapi_key)
            if enable_newsapi_ai and newsapi_ai_key:
                newsapi_ai_headlines = _fetch_from_newsapi_ai(ticker, stock_name, newsapi_ai_key)

        fallback_headlines = newsdata_headlines + newsapi_headlines + newsapi_ai_headlines
        raw_headlines: list[dict[str, Any]] = (
            (finnhub_headlines + fallback_headlines) if fallback_used else finnhub_headlines
        )


        # Remove duplicates (exact/normalized title and near-duplicate title variants).
        # We intentionally do NOT dedupe purely by link because some providers can
        # return many distinct headlines that share the same landing-page URL.
        seen_titles = set()
        unique_headlines: list[dict[str, Any]] = []
        for h in raw_headlines:
            title = h.get("title") or ""
            key = _normalize_title_for_dedupe(title)
            if not key or key in seen_titles:
                continue

            # Near-duplicate guard for provider variants:
            # same apiSource + same publish minute + highly similar titles.
            candidate_api = (h.get("apiSource") or "").strip().lower()
            candidate_minute = _published_minute_key(h.get("publishedAt"))
            is_near_duplicate = False
            if candidate_api and candidate_minute:
                for existing in unique_headlines:
                    existing_api = (existing.get("apiSource") or "").strip().lower()
                    if existing_api != candidate_api:
                        continue

                    existing_minute = _published_minute_key(existing.get("publishedAt"))
                    if existing_minute != candidate_minute:
                        continue

                    existing_key = _normalize_title_for_dedupe(existing.get("title") or "")
                    if not existing_key:
                        continue

                    if SequenceMatcher(None, key, existing_key).ratio() >= 0.92:
                        is_near_duplicate = True
                        break

            if is_near_duplicate:
                continue

            seen_titles.add(key)
            unique_headlines.append(h)

        unique_headlines.sort(
            key=lambda h: _parse_published_at(h.get("publishedAt")),
            reverse=True,
        )

        # print(unique_headlines)

        latest_timestamp = unique_headlines[0].get("publishedAt", "") if unique_headlines else ""
        analysis_logger.info(
            "SENTIMENT_FETCH_COUNTS ticker=%s finnhub=%d finnhub_failed=%s fallback_used=%s newsdata=%d newsapi=%d newsapi_ai=%d raw_total=%d unique_total=%d latest=%s",
            ticker,
            len(finnhub_headlines),
            finnhub_failed,
            fallback_used,
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

        # print(titles_for_model) #############################################

        # Run FinBERT batch analysis
        pipe = _get_finbert()
        per_headline = []
        if pipe and titles_for_model:
            try:
                with _inference_lock:
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

        # Calculate overall score directly to prevent duplicate inference
        score_map = {"positive": 1, "negative": -1, "neutral": 0}
        total = 0.0
        count = 0
        for ph in per_headline:
            label = ph.get("sentiment", "neutral").lower()
            if label == "neutral":
                continue
            conf = float(ph.get("sentimentScore", 0.0))
            base = score_map.get(label, 0)
            total += base * conf
            count += 1

        if not count:
            overall = 50.0
        else:
            avg = total / count
            overall = round(50 + 50 * max(-1.0, min(1.0, avg)), 1)

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
