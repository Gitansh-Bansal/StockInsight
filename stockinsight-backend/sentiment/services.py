"""
Sentiment analysis: fetch news for ticker, run FinBERT, return headlines and 0–100 score.
Uses NewsData.io and NewsAPI (not Yahoo Finance) plus Hugging Face FinBERT.
"""
import logging
import os
from typing import Any, List

import requests
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

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



def _load_keys() -> tuple[str | None, str | None]:
    """Load NEWSDATAIO_API_KEY and NEWS_API_KEY from .env/environment."""
    load_dotenv()
    newsdata_key = os.getenv("NEWSDATAIO_API_KEY")
    newsapi_key = os.getenv("NEWS_API_KEY")
    if not newsdata_key:
        logger.warning("NEWSDATAIO_API_KEY not set; NewsData.io results will be skipped.")
    if not newsapi_key:
        logger.warning("NEWS_API_KEY not set; NewsAPI results will be skipped.")
    return newsdata_key, newsapi_key


def _fetch_from_newsdataio(ticker: str, stock_name: str | None, api_key: str) -> list[dict[str, Any]]:
    """Fetch headlines from NewsData.io by ticker and stock name."""
    url = "https://newsdata.io/api/1/latest"
    headlines: list[dict[str, Any]] = []

    for query in {ticker, stock_name} - {None}:
        try:
            params = {
                "apikey": api_key,
                "q": f"${query}",
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
                        }
                    )
        except Exception as e:
            logger.warning("NewsData.io error for query %s: %s", query, e)

    return headlines


def _fetch_from_newsapi(ticker: str, stock_name: str | None, api_key: str) -> list[dict[str, Any]]:
    """Fetch headlines from NewsAPI.org by ticker and stock name."""
    url = "https://newsapi.org/v2/everything"
    headlines: list[dict[str, Any]] = []

    for query in {ticker, stock_name} - {None}:
        try:
            params = {
                "q": f"${query}",
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
                    }
                )
        except Exception as e:
            logger.warning("NewsAPI error for query %s: %s", query, e)

    return headlines


def get_sentiment_analysis(ticker: str, max_news: int = 100) -> dict[str, Any] | None:
    """
    Fetch latest news for ticker from NewsData.io and NewsAPI, run FinBERT on titles,
    and return list of headlines with an overall sentiment score (0–100).
    """
    try:
        ticker = ticker.upper().strip()
        newsdata_key, newsapi_key = _load_keys()

        # You can optionally pass a human-readable name from elsewhere; for now we just reuse ticker.
        stock_name = ticker

        raw_headlines: list[dict[str, Any]] = []
        if newsdata_key:
            raw_headlines.extend(_fetch_from_newsdataio(ticker, stock_name, newsdata_key))
        if newsapi_key:
            raw_headlines.extend(_fetch_from_newsapi(ticker, stock_name, newsapi_key))

        if not raw_headlines:
            return {
                "headlines": [],
                "score": 50.0,
                "data": {"symbol": ticker, "count": 0},
            }

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
