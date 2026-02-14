"""
Technical analysis: fetch OHLCV and indicators from yfinance, compute a 0-100 score.
"""
import logging
from typing import Any

import yfinance as yf
import pandas as pd
import numpy as np

logger = logging.getLogger(__name__)

#this is comment 1
#this is comment 2


def _compute_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = delta.where(delta > 0, 0.0)
    loss = (-delta).where(delta < 0, 0.0)
    avg_gain = gain.ewm(alpha=1 / period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def _compute_technical_score(
    close: float,
    sma20: float | None,
    sma50: float | None,
    rsi: float | None,
    low52: float | None,
    high52: float | None,
) -> float:
    """
    Compute a 0-100 technical score from price vs SMAs, RSI, and 52w position.
    """
    score = 50.0
    adjustments = []

    # Price above SMA20 and SMA50 = bullish
    if sma20 is not None and close > 0:
        if close > sma20:
            adjustments.append(5)
        else:
            adjustments.append(-3)
    if sma50 is not None and close > 0:
        if close > sma50:
            adjustments.append(5)
        else:
            adjustments.append(-2)

    # RSI: 30-70 is healthy; <30 oversold (potential buy), >70 overbought
    if rsi is not None:
        if 40 <= rsi <= 60:
            adjustments.append(3)
        elif rsi < 30:
            adjustments.append(4)  # oversold, potential reversal
        elif rsi > 70:
            adjustments.append(-4)

    # Position in 52w range
    if low52 is not None and high52 is not None and high52 > low52 and close is not None:
        pct = (close - low52) / (high52 - low52)
        if 0.3 <= pct <= 0.7:
            adjustments.append(2)
        elif pct > 0.9:
            adjustments.append(-2)

    if adjustments:
        score += sum(adjustments)
    return max(0.0, min(100.0, round(score, 1)))


def get_technical_analysis(ticker: str, period: str = "1y") -> dict[str, Any] | None:
    """
    Fetch technical data (OHLCV, SMA20, SMA50, RSI) and compute technical score (0-100).
    period: 1mo, 3mo, 6mo, 1y, 2y, 5y
    """
    try:
        t = yf.Ticker(ticker.upper().strip())
        hist = t.history(period=period, auto_adjust=True)
        if hist is None or hist.empty or len(hist) < 20:
            return None

        close = hist["Close"]
        sma20 = close.rolling(20).mean()
        sma50 = close.rolling(50).mean()
        rsi = _compute_rsi(close, 14)

        last_close = float(close.iloc[-1])
        last_sma20 = float(sma20.iloc[-1]) if not pd.isna(sma20.iloc[-1]) else None
        last_sma50 = float(sma50.iloc[-1]) if not pd.isna(sma50.iloc[-1]) else None
        last_rsi = float(rsi.iloc[-1]) if not pd.isna(rsi.iloc[-1]) else None

        info = t.info
        low52 = info.get("fiftyTwoWeekLow")
        high52 = info.get("fiftyTwoWeekHigh")
        if low52 is not None:
            low52 = float(low52)
        if high52 is not None:
            high52 = float(high52)

        score = _compute_technical_score(
            last_close, last_sma20, last_sma50, last_rsi, low52, high52
        )

        # OHLCV for chart (last 252 points)
        max_points = 252
        hist_tail = hist.tail(max_points)
        ohlcv = [
            {
                "date": d.isoformat()[:10],
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
                "volume": int(row["Volume"]),
            }
            for d, row in hist_tail.iterrows()
        ]

        return {
            "data": {
                "symbol": ticker.upper(),
                "period": period,
                "ohlcv": ohlcv,
                "lastClose": last_close,
                "sma20": last_sma20,
                "sma50": last_sma50,
                "rsi": round(last_rsi, 2) if last_rsi is not None else None,
                "52WeekLow": low52,
                "52WeekHigh": high52,
            },
            "score": score,
        }
    except Exception as e:
        logger.exception("get_technical_analysis failed for %s: %s", ticker, e)
        return None
