"""
LLM report generation: produce sectioned summaries using Gemini with a
deterministic fallback.
"""
import json
import logging
import os
import re
from typing import Any

from dotenv import load_dotenv
from google import genai
from google.genai import types

logger = logging.getLogger(__name__)


ReportSections = dict[str, str]
ReportBundle = dict[str, Any]


def _get_gemini_client() -> genai.Client | None:
    """Initialise Gemini client from GEMINI_API_KEY."""
    load_dotenv()
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.warning("GEMINI_API_KEY not set; using fallback section summaries.")
        return None
    try:
        return genai.Client(api_key=api_key)
    except Exception as exc:
        logger.warning("Failed to initialise Gemini client: %s", exc)
        return None


def generate_report_bundle(
    ticker: str,
    fundamental_result: dict[str, Any] | None,
    technical_result: dict[str, Any] | None,
    sentiment_result: dict[str, Any] | None,
    overall_score: float,
    verdict: str,
) -> ReportBundle:
    """
    Generate sectioned LLM report. Returns:
    {
      "source": "gemini" | "fallback",
      "fullReport": str,
      "sections": {
        "overall": str,
        "fundamental": str,
        "technical": str,
        "sentiment": str,
        "riskFactors": str,
        "conclusion": str,
        "disclaimer": str
      }
    }
    """
    client = _get_gemini_client()
    if client is None:
        return _placeholder_report_bundle(
            ticker=ticker,
            overall_score=overall_score,
            verdict=verdict,
        )

    prompt = _build_structured_prompt(
        ticker=ticker,
        fundamental_result=fundamental_result,
        technical_result=technical_result,
        sentiment_result=sentiment_result,
        overall_score=overall_score,
        verdict=verdict,
    )

    try:
        parsed: dict[str, Any] | None = None
        last_raw_text = ""
        for attempt in range(1, 3):
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=(
                    prompt
                    if attempt == 1
                    else _build_json_retry_prompt(prompt)
                ),
                config=types.GenerateContentConfig(
                    thinking_config=types.ThinkingConfig(thinking_budget=0),
                    response_mime_type="application/json",
                ),
            )
            raw_text = (getattr(response, "text", "") or "").strip()
            last_raw_text = raw_text
            parsed = _parse_json_object(raw_text)
            if parsed is not None:
                break
            logger.warning(
                "Gemini response was not valid JSON on attempt %d/2.",
                attempt,
            )

        if parsed is None:
            if last_raw_text:
                logger.warning(
                    "Gemini response parse failed after retry. Preview: %s",
                    last_raw_text[:400].replace("\n", "\\n"),
                )
            logger.warning("Gemini response was not valid JSON. Falling back.")
            return _placeholder_report_bundle(
                ticker=ticker,
                overall_score=overall_score,
                verdict=verdict,
            )

        sections = _normalise_sections(parsed)
        full_report = str(parsed.get("fullReportMarkdown") or "").strip()
        if not full_report:
            full_report = _build_markdown_from_sections(ticker, sections)

        return {
            "source": "gemini",
            "fullReport": full_report,
            "sections": sections,
        }
    except Exception as exc:
        logger.exception("Gemini generation failed: %s", exc)
        return _placeholder_report_bundle(
            ticker=ticker,
            overall_score=overall_score,
            verdict=verdict,
        )


def generate_report(
    ticker: str,
    fundamental_result: dict[str, Any] | None,
    technical_result: dict[str, Any] | None,
    sentiment_result: dict[str, Any] | None,
    overall_score: float,
    verdict: str,
) -> str:
    """Backward-compatible string report API."""
    bundle = generate_report_bundle(
        ticker=ticker,
        fundamental_result=fundamental_result,
        technical_result=technical_result,
        sentiment_result=sentiment_result,
        overall_score=overall_score,
        verdict=verdict,
    )
    return str(bundle.get("fullReport") or "")


def _extract_technical_prompt_data(
    technical_result: dict[str, Any] | None,
) -> dict[str, Any]:
    """
    Build a Gemini-ready technical payload from either:
    1) legacy shape with `data`, or
    2) current shape with top-level `indicators` / `structure`.
    """
    technical_payload = technical_result or {}
    technical_data = technical_payload.get("data") or {}
    indicators = technical_payload.get("indicators") or {}
    structure = technical_payload.get("structure") or {}

    return {
        "symbol": technical_data.get("symbol") or technical_payload.get("symbol"),
        "trend": technical_payload.get("trend"),
        "signal": technical_payload.get("signal"),
        "reasons": technical_payload.get("reasons") or [],
        "lastClose": technical_data.get("lastClose", indicators.get("close")),
        "sma20": technical_data.get("sma20", indicators.get("SMA20")),
        "sma50": technical_data.get("sma50", indicators.get("SMA50")),
        "sma200": indicators.get("SMA200"),
        "rsi": technical_data.get("rsi", indicators.get("RSI")),
        "macd": indicators.get("MACD"),
        "macdSignal": indicators.get("MACD_signal"),
        "adx": indicators.get("ADX"),
        "atr": indicators.get("ATR"),
        "fiftyTwoWeekLow": technical_data.get(
            "52WeekLow",
            indicators.get("52WeekLow"),
        ),
        "fiftyTwoWeekHigh": technical_data.get(
            "52WeekHigh",
            indicators.get("52WeekHigh"),
        ),
        "breakout": structure.get("breakout"),
        "volumeSpike": structure.get("volumeSpike"),
        "supportLevels": structure.get("support"),
        "resistanceLevels": structure.get("resistance"),
        "fibonacciLevels": structure.get("fibonacciLevels"),
    }


def _build_structured_prompt(
    ticker: str,
    fundamental_result: dict[str, Any] | None,
    technical_result: dict[str, Any] | None,
    sentiment_result: dict[str, Any] | None,
    overall_score: float,
    verdict: str,
) -> str:
    fundamental_data = (fundamental_result or {}).get("data") or {}
    technical_data = _extract_technical_prompt_data(technical_result)
    sentiment_data = (sentiment_result or {}).get("data") or {}
    headlines = _compact_sentiment_headlines((sentiment_result or {}).get("headlines"))

    payload = {
        "ticker": ticker.upper(),
        "overallScore": overall_score,
        "verdict": verdict,
        # "scoringSystem": {
        #     "overallWeights": {
        #         "fundamental": 0.35,
        #         "technical": 0.35,
        #         "sentiment": 0.30,
        #     },
        #     "technicalRules": {
        #         "priceVsSma20": "close>sma20 +5 else -3",
        #         "priceVsSma50": "close>sma50 +5 else -2",
        #         "rsi": "40-60 +3, <30 +4, >70 -4",
        #         "fiftyTwoWeekPosition": "30%-70% +2, >90% -2",
        #         "baseScore": 50,
        #     },
        #     "sentimentRules": {
        #         "model": "FinBERT",
        #         "labels": {"positive": 1, "neutral": 0, "negative": -1},
        #         "mapping": "weighted average in [-1,1], mapped to score = 50 + 50*avg",
        #     },
        #     "fundamentalRules": (
        #         "Sector-aware composite score from valuation, profitability, "
        #         "financial health, growth, and penalties."
        #     ),
        # },
        "fundamentalScore": (fundamental_result or {}).get("score"),
        "technicalScore": (technical_result or {}).get("score"),
        "sentimentScore": (sentiment_result or {}).get("score"),
        "fundamentalData": {
            "sector": fundamental_data.get("sector"),
            "industry": fundamental_data.get("industry"),
            "currentPrice": fundamental_data.get("currentPrice"),
            "trailingPE": fundamental_data.get("trailingPE"),
            "forwardPE": fundamental_data.get("forwardPE"),
            "pegRatio": fundamental_data.get("pegRatio"),
            "priceToBook": fundamental_data.get("priceToBook"),
            "returnOnEquity": fundamental_data.get("returnOnEquity"),
            "operatingMargins": fundamental_data.get("operatingMargins"),
            "profitMargins": fundamental_data.get("profitMargins"),
            "debtToEquity": fundamental_data.get("debtToEquity"),
            "revenueGrowth": fundamental_data.get("revenueGrowth"),
            "earningsGrowth": fundamental_data.get("earningsGrowth"),
            "dividendYield": fundamental_data.get("dividendYield"),
            "marketCap": fundamental_data.get("marketCap"),
            "fiftyTwoWeekLow": fundamental_data.get("52WeekLow"),
            "fiftyTwoWeekHigh": fundamental_data.get("52WeekHigh"),
            "sectorPeersAnalysis": fundamental_data.get("sectorPeersAnalysis"),
        },
        "technicalData": {
            "symbol": technical_data.get("symbol"),
            "trend": technical_data.get("trend"),
            "signal": technical_data.get("signal"),
            "reasons": technical_data.get("reasons"),
            "lastClose": technical_data.get("lastClose"),
            "sma20": technical_data.get("sma20"),
            "sma50": technical_data.get("sma50"),
            "sma200": technical_data.get("sma200"),
            "rsi": technical_data.get("rsi"),
            "macd": technical_data.get("macd"),
            "macdSignal": technical_data.get("macdSignal"),
            "adx": technical_data.get("adx"),
            "atr": technical_data.get("atr"),
            "fiftyTwoWeekLow": technical_data.get("fiftyTwoWeekLow"),
            "fiftyTwoWeekHigh": technical_data.get("fiftyTwoWeekHigh"),
            "breakout": technical_data.get("breakout"),
            "volumeSpike": technical_data.get("volumeSpike"),
            "supportLevels": technical_data.get("supportLevels"),
            "resistanceLevels": technical_data.get("resistanceLevels"),
            "fibonacciLevels": technical_data.get("fibonacciLevels"),
        },
        "sentimentData": {
            "headlineCount": sentiment_data.get("count"),
            "headlines": headlines,
        },
    }

    return (
        "Role: Senior Financial Analyst\n"
        "Task: Create an equity research report in the given output format based on the analysis results given in JSON input.\n"

        "The output should be produced in this output JSON format:\n"
        "JSON schema:\n"
        "{\n"
        '  "overall": "5-7 sentences: include component scores, and explain the result using the fundamental, technical and news sentiment metrics' \
        '",\n'
        '  "fundamental": "4-6 bullet points (use `- `). Make each bullet unique and specific. Mention the score and explain using the fundamental metrics. Include one bullet point comparing the company\'s valuation (trailing and forward P/E) to its sector peers based on the sectorPeersAnalysis data.",\n'
        '  "technical": "4-6 bullet points (use `- `). Make each bullet unique and specific: include technical score + bias in one bullet, trend context (price vs SMA20/SMA50/SMA200) in one bullet, momentum context (RSI/MACD/ADX) in one bullet, and key levels/structure (support, resistance, breakout, volume spike, fibonacci) plus one risk/watchout. Skip missing metrics instead of repeating available ones",\n'
        '  "sentiment": "Start with 3-5 bullet points (use `- `) highlighting the main insights from the news headlines, then add a `Summary:` paragraph of 4-6 sentences that mentions the score and explains the overall sentiment signal",\n'
        '  "riskFactors": "2-4 sentences",\n'
        '  "conclusion": "2-4 sentences: mention the final verdict and conclusion",\n'
        '  "disclaimer": "1 sentence",\n'
        '  "fullReportMarkdown": "full markdown report with matching sections"\n'
        "}\n\n"

        "Note:\n"
        "- Keep the tone professional.\n"
        "- Be concise and neutral.\n"
        "- Return strict JSON only (no markdown code fences).\n"
        "- For `technical`, keep the bullet points in a single string value.\n"
        "- For `technical`, avoid redundancy: do not repeat the same metric across bullets.\n"
        "- For `sentiment`, keep the bullets and summary in a single string value.\n"


        f"Input JSON:\n{json.dumps(payload, ensure_ascii=True)}"
    )


def _build_json_retry_prompt(base_prompt: str) -> str:
    return (
        f"{base_prompt}\n\n"
        "CRITICAL OUTPUT REQUIREMENT:\n"
        "Return only one valid JSON object.\n"
        "Do not include markdown, comments, or code fences.\n"
    )


def _compact_sentiment_headlines(raw_headlines: Any) -> list[dict[str, Any]]:
    """
    Keep prompt size bounded and stable; oversized noisy payloads increase
    malformed/truncated JSON responses from the model.
    """
    if not isinstance(raw_headlines, list):
        return []

    compact: list[dict[str, Any]] = []
    for headline in raw_headlines:
        if not isinstance(headline, dict):
            continue
        compact.append(
            {
                "title": headline.get("title"),
                "source": headline.get("source"),
                "publishedAt": headline.get("publishedAt"),
                "sentiment": headline.get("sentiment"),
                "sentimentScore": headline.get("sentimentScore"),
            }
        )
    return compact


def _parse_json_object(raw_text: str) -> dict[str, Any] | None:
    if not raw_text:
        return None

    # Fast path: entire response is JSON
    try:
        obj = json.loads(raw_text)
        if isinstance(obj, dict):
            return obj
    except Exception:
        pass

    # Fallback: parse fenced JSON blocks if present.
    for block in re.findall(r"```(?:json)?\s*([\s\S]*?)```", raw_text, flags=re.IGNORECASE):
        try:
            obj = json.loads(block.strip())
            if isinstance(obj, dict):
                return obj
        except Exception:
            continue

    # Robust scan: decode first valid JSON object anywhere in the text.
    decoder = json.JSONDecoder()
    for match in re.finditer(r"\{", raw_text):
        start = match.start()
        try:
            obj, _ = decoder.raw_decode(raw_text[start:])
            if isinstance(obj, dict):
                return obj
        except Exception:
            continue

    return None


def _normalise_sections(parsed: dict[str, Any]) -> ReportSections:
    def _text(key: str, default: str) -> str:
        value = parsed.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        return default

    return {
        "overall": _text("overall", "Overall section unavailable."),
        "fundamental": _text("fundamental", "Fundamental section unavailable."),
        "technical": _text("technical", "Technical section unavailable."),
        "sentiment": _text("sentiment", "Sentiment section unavailable."),
        "riskFactors": _text("riskFactors", "Risk section unavailable."),
        "conclusion": _text("conclusion", "Conclusion unavailable."),
        "disclaimer": _text(
            "disclaimer",
            "This is not investment advice. Do your own research.",
        ),
    }


def _build_markdown_from_sections(ticker: str, sections: ReportSections) -> str:
    return (
        f"# Stock Analysis Report: {ticker.upper()}\n\n"
        "## Overall\n"
        f"{sections['overall']}\n\n"
        "## Fundamental\n"
        f"{sections['fundamental']}\n\n"
        "## Technical\n"
        f"{sections['technical']}\n\n"
        "## Sentiment\n"
        f"{sections['sentiment']}\n\n"
        "## Risk Factors\n"
        f"{sections['riskFactors']}\n\n"
        "## Conclusion\n"
        f"{sections['conclusion']}\n\n"
        "## Disclaimer\n"
        f"{sections['disclaimer']}\n"
    )


def _placeholder_report_bundle(
    ticker: str,
    overall_score: float,
    verdict: str,
) -> ReportBundle:
    sections: ReportSections = {
        "overall": (
            f"Overall score is {overall_score}/100 with a {verdict} verdict "
            "based on the combined model signals."
        ),
        "fundamental": (
            "Fundamental interpretation is unavailable from Gemini at the moment. "
            "Fallback logic can still be used in the frontend."
        ),
        "technical": (
            "Technical interpretation is unavailable from Gemini at the moment. "
            "Fallback logic can still be used in the frontend."
        ),
        "sentiment": (
            "Sentiment interpretation is unavailable from Gemini at the moment. "
            "Fallback logic can still be used in the frontend."
        ),
        "riskFactors": "Macro conditions, earnings misses, and sector rotation remain key risks.",
        "conclusion": "Current output should be treated as informational, not a recommendation.",
        "disclaimer": "This is not investment advice. Do your own research.",
    }
    return {
        "source": "fallback",
        "fullReport": _build_markdown_from_sections(ticker, sections),
        "sections": sections,
    }
