"""
Orchestration: run fundamental, technical, and sentiment analysis; compute overall score
and verdict; generate comprehensive report. Single entry point for "analyze ticker".
"""
import logging
from typing import Any

from fundamental.services import get_fundamental_analysis
from technical.services import get_technical_analysis
from sentiment.services import get_sentiment_analysis
from reports.services import generate_report_bundle

logger = logging.getLogger(__name__)

# Weights for overall score (must sum to 1.0)
WEIGHT_FUNDAMENTAL = 0.35
WEIGHT_TECHNICAL = 0.35
WEIGHT_SENTIMENT = 0.30


def _compute_overall_score(
    fundamental_score: float | None,
    technical_score: float | None,
    sentiment_score: float | None,
) -> float:
    """Weighted average of available component scores. Missing components use 50 (neutral)."""
    total_weight = 0.0
    weighted_sum = 0.0
    if fundamental_score is not None:
        total_weight += WEIGHT_FUNDAMENTAL
        weighted_sum += WEIGHT_FUNDAMENTAL * fundamental_score
    else:
        total_weight += WEIGHT_FUNDAMENTAL
        weighted_sum += WEIGHT_FUNDAMENTAL * 50.0
    if technical_score is not None:
        total_weight += WEIGHT_TECHNICAL
        weighted_sum += WEIGHT_TECHNICAL * technical_score
    else:
        total_weight += WEIGHT_TECHNICAL
        weighted_sum += WEIGHT_TECHNICAL * 50.0
    if sentiment_score is not None:
        total_weight += WEIGHT_SENTIMENT
        weighted_sum += WEIGHT_SENTIMENT * sentiment_score
    else:
        total_weight += WEIGHT_SENTIMENT
        weighted_sum += WEIGHT_SENTIMENT * 50.0
    if total_weight <= 0:
        return 50.0
    return round(weighted_sum / total_weight, 1)


def _compute_verdict(overall_score: float) -> str:
    """Map overall score to Buy / Hold / Sell."""
    if overall_score >= 65:
        return "Buy"
    if overall_score >= 45:
        return "Hold"
    return "Sell"


def run_full_analysis(
    ticker: str,
    period: str = "1y",
    include_report: bool = True,
) -> dict[str, Any] | None:
    """
    Run fundamental, technical, and sentiment analysis; compute overall score and
    verdict; optionally generate LLM report.
    Returns one combined payload for the frontend, or None if ticker is invalid.
    """
    ticker = ticker.upper().strip()
    fundamental_result = get_fundamental_analysis(ticker)
    technical_result = get_technical_analysis(ticker, period=period)
    sentiment_result = get_sentiment_analysis(ticker)

    # If we have no data at all, treat as invalid ticker
    if fundamental_result is None and technical_result is None:
        return None

    fundamental_score = fundamental_result.get("score") if fundamental_result else None
    technical_score = technical_result.get("score") if technical_result else None
    sentiment_score = sentiment_result.get("score") if sentiment_result else None

    overall_score = _compute_overall_score(
        fundamental_score, technical_score, sentiment_score
    )
    verdict = _compute_verdict(overall_score)

    report_bundle: dict[str, Any] = {
        "source": "disabled",
        "fullReport": "",
        "sections": {},
    }
    if include_report:
        report_bundle = generate_report_bundle(
            ticker=ticker,
            fundamental_result=fundamental_result,
            technical_result=technical_result,
            sentiment_result=sentiment_result,
            overall_score=overall_score,
            verdict=verdict,
        )

    return {
        "ticker": ticker,
        "overview": {
            "fundamentalScore": fundamental_score,
            "technicalScore": technical_score,
            "sentimentScore": sentiment_score,
            "overallScore": overall_score,
            "verdict": verdict,
        },
        "fundamental": fundamental_result,
        "technical": technical_result,
        "sentiment": sentiment_result,
        "report": report_bundle.get("fullReport", ""),
        "reportSections": report_bundle.get("sections", {}),
        "reportSource": report_bundle.get("source", "unknown"),
    }
