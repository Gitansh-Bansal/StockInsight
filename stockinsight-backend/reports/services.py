"""
Comprehensive report: generate a written analysis using Gemini LLM from fundamental,
technical, sentiment results, overall score, and verdict.
"""
import logging
import os
from typing import Any

from dotenv import load_dotenv
from google import genai

logger = logging.getLogger(__name__)


def _get_gemini_client() -> genai.Client | None:
    """
    Initialise a Gemini client using API key from .env (GEMINI_API_KEY).
    Returns None if key or client is unavailable.
    """
    # Load environment variables from .env (project root)
    load_dotenv()

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.warning("GEMINI_API_KEY not set in environment/.env; using placeholder report.")
        return None

    try:
        client = genai.Client(api_key=api_key)
        return client
    except Exception as exc:
        logger.warning("Failed to initialise Gemini client: %s. Using placeholder report.", exc)
        return None


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
    Returns report string; on failure returns a placeholder report string.
    """
    client = _get_gemini_client()
    if client is None:
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
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
        text = getattr(response, "text", "") or ""
        if text.strip():
            return text.strip()
        return _placeholder_report(ticker, overall_score, verdict)
    except Exception as exc:
        logger.exception("Gemini generate_content failed: %s", exc)
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
        "You are a professional equity analyst. Write a comprehensive report for the following stock analysis. Use clear, neutral language and cite the provided metrics.",
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
        """Write the report in markdown. Follow the following structure: 
        1) Executive Summary, 
        2) Fundamental summary, 
        3) Technical summary, 
        4) Sentiment summary, 
        5) Risk Factors,
        5) Conclusion
        Mention the risk disclaimer at end.""",
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
