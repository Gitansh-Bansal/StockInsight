"""
Comprehensive report: generate a written analysis using Gemini LLM from fundamental,
technical, sentiment results, overall score, and verdict.
"""
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


def generate_report(
    ticker: str,
    fundamental_result: dict[str, Any] | None,
    technical_result: dict[str, Any] | None,
    sentiment_result: dict[str, Any] | None,
    overall_score: float,
    verdict: str,
) -> str:
    """
    Call Gemini to produce a short comprehensive report (markdown or plain text).
    Returns report string; on failure returns an error message string.
    """
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        logger.warning("GEMINI_API_KEY not set; returning placeholder report.")
        return _placeholder_report(ticker, overall_score, verdict)

    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-1.5-flash")
    except Exception as e:
        logger.warning("Gemini not available: %s. Returning placeholder.", e)
        return _placeholder_report(ticker, overall_score, verdict)

    prompt = _build_prompt(
        ticker=ticker,
        fundamental_result=fundamental_result,
        technical_result=technical_result,
        sentiment_result=sentiment_result,
        overall_score=overall_score,
        verdict=verdict,
    )

    try:
        response = model.generate_content(prompt)
        if response and response.text:
            return response.text.strip()
        return _placeholder_report(ticker, overall_score, verdict)
    except Exception as e:
        logger.exception("Gemini generate_content failed: %s", e)
        return _placeholder_report(ticker, overall_score, verdict)


def _build_prompt(
    ticker: str,
    fundamental_result: dict[str, Any] | None,
    technical_result: dict[str, Any] | None,
    sentiment_result: dict[str, Any] | None,
    overall_score: float,
    verdict: str,
) -> str:
    """Build the prompt for Gemini."""
    parts = [
        "You are a professional equity analyst. Write a concise comprehensive report (3–5 paragraphs) for the following stock analysis. Use clear, neutral language and cite the provided metrics.",
        "",
        f"**Ticker:** {ticker.upper()}",
        f"**Overall score (0–100):** {overall_score}",
        f"**Verdict:** {verdict}",
        "",
    ]

    if fundamental_result:
        data = fundamental_result.get("data") or {}
        score = fundamental_result.get("score")
        parts.append(f"**Fundamental score:** {score}. Key data: P/E {data.get('trailingPE')}, PEG {data.get('pegRatio')}, Market cap {data.get('marketCap')}, Sector {data.get('sector')}, 52w range {data.get('52WeekLow')}–{data.get('52WeekHigh')}.")
    else:
        parts.append("**Fundamental:** Data unavailable.")

    if technical_result:
        data = technical_result.get("data") or {}
        score = technical_result.get("score")
        parts.append(f"**Technical score:** {score}. Last close {data.get('lastClose')}, SMA20 {data.get('sma20')}, SMA50 {data.get('sma50')}, RSI {data.get('rsi')}.")
    else:
        parts.append("**Technical:** Data unavailable.")

    if sentiment_result:
        score = sentiment_result.get("score")
        count = (sentiment_result.get("data") or {}).get("count", 0)
        parts.append(f"**Sentiment score:** {score}. Based on {count} news headlines.")
    else:
        parts.append("**Sentiment:** Data unavailable.")

    parts.extend([
        "",
        "Write the report in markdown. Include: 1) Brief overview and verdict explanation, 2) Fundamental summary, 3) Technical summary, 4) Sentiment summary, 5) Conclusion and risk note.",
    ])
    return "\n".join(parts)


def _placeholder_report(ticker: str, overall_score: float, verdict: str) -> str:
    return f"""# Stock Analysis Report: {ticker.upper()}

## Overview
Overall score: **{overall_score}/100**. Verdict: **{verdict}**.

## Summary
This report is based on fundamental metrics, technical indicators, and news sentiment. Configure `GEMINI_API_KEY` to generate a full LLM-powered report.

## Risk Disclaimer
This is not investment advice. Do your own research before making decisions.
"""
