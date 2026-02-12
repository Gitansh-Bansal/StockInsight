"""
Sentiment analysis: fetch news for ticker, run FinBERT, return headlines and 0-100 score.
Uses Hugging Face transformers with ProsusAI/finbert (or fallback if not installed).
"""
import logging
from typing import Any

import yfinance as yf

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
            logger.warning("FinBERT not available: %s. Using fallback.", e)
    return _finbert_pipeline


def _sentiment_to_score(label: str, score: float) -> float:
    """Map FinBERT positive/negative/neutral + confidence to 0-100."""
    label = (label or "").lower()
    if "positive" in label:
        return 50 + 50 * score
    if "negative" in label:
        return 50 - 50 * score
    return 50.0


def get_sentiment_analysis(ticker: str, max_news: int = 15) -> dict[str, Any] | None:
    """
    Fetch latest news for ticker (yfinance), run FinBERT on titles/summaries,
    return list of headlines with sentiment and an overall sentiment score (0-100).
    Returns None if ticker invalid or no news.
    """
    try:
        t = yf.Ticker(ticker.upper().strip())
        news = t.news
        if not news:
            return {
                "headlines": [],
                "score": 50.0,
                "data": {"symbol": ticker.upper(), "count": 0},
            }

        headlines = []
        pipe = _get_finbert()
        scores_for_avg = []

        for item in news[:max_news]:
            title = item.get("title") or ""
            link = item.get("link") or ""
            # optional: item.get("publisher"), item.get("providerPublishTime")
            text = title
            if not text.strip():
                continue

            sentiment_label = "neutral"
            sentiment_score = 0.5
            if pipe:
                try:
                    out = pipe(text[:512])[0]
                    sentiment_label = out.get("label", "neutral")
                    sentiment_score = float(out.get("score", 0.5))
                    scores_for_avg.append(_sentiment_to_score(sentiment_label, sentiment_score))
                except Exception as e:
                    logger.debug("FinBERT run failed for text: %s", e)

            headlines.append({
                "title": title,
                "link": link,
                "sentiment": sentiment_label,
                "sentimentScore": round(sentiment_score, 3),
            })

        overall = 50.0
        if scores_for_avg:
            overall = max(0.0, min(100.0, round(sum(scores_for_avg) / len(scores_for_avg), 1)))

        return {
            "data": {
                "symbol": ticker.upper(),
                "count": len(headlines),
            },
            "headlines": headlines,
            "score": overall,
        }
    except Exception as e:
        logger.exception("get_sentiment_analysis failed for %s: %s", ticker, e)
        return None
