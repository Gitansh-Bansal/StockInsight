"""
Fundamental analysis: fetch company/financial data from yfinance and compute a 0-100 score.
"""
import logging
from typing import Any

import yfinance as yf

logger = logging.getLogger(__name__)


def _safe_get(info: dict, *keys: str, default: Any = None) -> Any:
    for key in keys:
        if key in info and info[key] is not None:
            return info[key]
    return default


def _compute_fundamental_score(info: dict) -> float:
    """
    Compute a 0-100 fundamental score from key metrics.
    Uses P/E, PEG, dividend yield, profit margins, growth proxies, and relative to 52w range.
    """
    score = 50.0  # start neutral
    adjustments = []

    # P/E: lower is often better (value); cap impact
    pe = _safe_get(info, "trailingPE")
    if pe is not None and pe > 0:
        if pe < 15:
            adjustments.append(8)
        elif pe < 25:
            adjustments.append(4)
        elif pe > 40:
            adjustments.append(-6)
        elif pe > 60:
            adjustments.append(-10)

    # PEG: lower is better (growth at reasonable price)
    peg = _safe_get(info, "pegRatio")
    if peg is not None and peg > 0:
        if peg < 1:
            adjustments.append(6)
        elif peg < 1.5:
            adjustments.append(2)
        elif peg > 2.5:
            adjustments.append(-4)

    # Dividend yield (moderate yield is a positive signal for stability)
    div_yield = _safe_get(info, "dividendYield")
    if div_yield is not None and div_yield > 0:
        if 0.01 <= div_yield <= 0.05:
            adjustments.append(4)
        elif div_yield > 0.05:
            adjustments.append(2)

    # Price vs 52-week range (closer to low = potential value)
    low52 = _safe_get(info, "fiftyTwoWeekLow")
    high52 = _safe_get(info, "fiftyTwoWeekHigh")
    current = _safe_get(info, "currentPrice", "regularMarketPrice")
    if current is not None and low52 is not None and high52 is not None and high52 > low52:
        pct_in_range = (current - low52) / (high52 - low52)
        if pct_in_range < 0.3:
            adjustments.append(5)
        elif pct_in_range > 0.9:
            adjustments.append(-3)

    # Beta: lower beta = less volatility (stability)
    beta = _safe_get(info, "beta")
    if beta is not None:
        if 0.5 <= beta <= 1.2:
            adjustments.append(2)
        elif beta > 1.8:
            adjustments.append(-2)

    if adjustments:
        score += sum(adjustments)
    return max(0.0, min(100.0, round(score, 1)))


def get_fundamental_analysis(ticker: str) -> dict[str, Any] | None:
    """
    Fetch fundamental data from yfinance and compute fundamental score (0-100).
    Returns None if ticker invalid or fetch fails.
    """
    try:
        t = yf.Ticker(ticker.upper().strip())
        info = t.info
        if not info or "symbol" not in info:
            return None

        data = {
            "symbol": info.get("symbol"),
            "shortName": _safe_get(info, "shortName", "longName", default=ticker.upper()),
            "longName": _safe_get(info, "longName", "shortName", default=""),
            "sector": _safe_get(info, "sector"),
            "industry": _safe_get(info, "industry"),
            "website": _safe_get(info, "website"),
            "description": _safe_get(info, "longBusinessSummary"),
            "marketCap": _safe_get(info, "marketCap"),
            "enterpriseValue": _safe_get(info, "enterpriseValue"),
            "trailingPE": _safe_get(info, "trailingPE"),
            "forwardPE": _safe_get(info, "forwardPE"),
            "pegRatio": _safe_get(info, "pegRatio"),
            "priceToBook": _safe_get(info, "priceToBook"),
            "trailingEps": _safe_get(info, "trailingEps"),
            "forwardEps": _safe_get(info, "forwardEps"),
            "dividendYield": _safe_get(info, "dividendYield"),
            "dividendRate": _safe_get(info, "dividendRate"),
            "payoutRatio": _safe_get(info, "payoutRatio"),
            "beta": _safe_get(info, "beta"),
            "52WeekHigh": _safe_get(info, "fiftyTwoWeekHigh"),
            "52WeekLow": _safe_get(info, "fiftyTwoWeekLow"),
            "averageVolume": _safe_get(info, "averageVolume"),
            "volume": _safe_get(info, "volume"),
            "targetMeanPrice": _safe_get(info, "targetMeanPrice"),
            "recommendationKey": _safe_get(info, "recommendationKey"),
            "numberOfAnalystOpinions": _safe_get(info, "numberOfAnalystOpinions"),
            "currency": _safe_get(info, "currency", default="USD"),
            "currentPrice": _safe_get(info, "currentPrice", "regularMarketPrice"),
        }

        score = _compute_fundamental_score(info)
        return {
            "data": data,
            "score": score,
        }
    except Exception as e:
        logger.exception("get_fundamental_analysis failed for %s: %s", ticker, e)
        return None
