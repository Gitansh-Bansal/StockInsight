from __future__ import annotations

import logging
import time
from typing import Any

import yfinance as yf

logger = logging.getLogger(__name__)

FX_CACHE_TTL_SECONDS = 3600
_fx_rate_cache: dict[str, tuple[float, float]] = {}


def _normalize_currency(value: Any) -> str:
    if value is None:
        return "USD"
    text = str(value).strip().upper()
    return text or "USD"


def _read_last_close(symbol: str) -> float | None:
    try:
        history = yf.Ticker(symbol).history(period="5d", auto_adjust=False)
        if history is None or history.empty or "Close" not in history:
            return None
        closes = history["Close"].dropna()
        if closes.empty:
            return None
        value = float(closes.iloc[-1])
        if value <= 0:
            return None
        return value
    except Exception as exc:
        logger.warning("Unable to fetch FX history for %s: %s", symbol, exc)
        return None


def _fetch_usd_rate(currency: str) -> float | None:
    normalized = _normalize_currency(currency)
    if normalized == "USD":
        return 1.0

    direct_symbol = f"{normalized}USD=X"
    direct_rate = _read_last_close(direct_symbol)
    if direct_rate is not None:
        return direct_rate

    inverse_symbol = f"USD{normalized}=X"
    inverse_rate = _read_last_close(inverse_symbol)
    if inverse_rate is not None and inverse_rate != 0:
        return 1.0 / inverse_rate

    logger.warning("No USD FX rate found for currency %s", normalized)
    return None


def get_usd_conversion_rates(currencies: list[str]) -> dict[str, float]:
    now = time.time()
    rates: dict[str, float] = {}

    for currency in currencies:
        normalized = _normalize_currency(currency)
        if normalized in rates:
            continue

        cached = _fx_rate_cache.get(normalized)
        if cached and now - cached[1] < FX_CACHE_TTL_SECONDS:
            rates[normalized] = cached[0]
            continue

        rate = _fetch_usd_rate(normalized)
        if rate is None:
            continue

        _fx_rate_cache[normalized] = (rate, now)
        rates[normalized] = rate

    return rates
