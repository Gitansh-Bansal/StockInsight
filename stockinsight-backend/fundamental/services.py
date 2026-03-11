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
    Compute a 0-100 fundamental score from key metrics, 
    with scope-safe extraction and strict sector-based health logic.
    """
    score = 0.0

    # ==========================================
    # 1. EXTRACT & PRE-CALCULATE ALL VARIABLES
    # ==========================================
    sector = _safe_get(info, "sector", default="")
    is_financial = (sector == "Financial Services")

    # Core Metrics
    current_price = _safe_get(info, "currentPrice", "regularMarketPrice")
    eps = _safe_get(info, "trailingEps")
    pb_ratio = _safe_get(info, "priceToBook")
    eps_growth = _safe_get(info, "earningsGrowth")
    rev_growth = _safe_get(info, "revenueGrowth")
    op_margin = _safe_get(info, "operatingMargins")
    net_margin = _safe_get(info, "profitMargins")
    de = _safe_get(info, "debtToEquity")
    div_yield = _safe_get(info, "dividendYield")
    payout = _safe_get(info, "payoutRatio")
    
    # PE Fallback
    pe = _safe_get(info, "trailingPE")
    if pe is None:
        pe = _safe_get(info, "forwardPE")
    if pe is None and current_price is not None and eps is not None and eps > 0:
        pe = current_price / eps

    # PEG Fallback
    peg = _safe_get(info, "pegRatio")
    if peg is None and pe is not None and eps_growth is not None and eps_growth > 0:
         peg = pe / (eps_growth * 100)

    # ROE Fallback
    roe = _safe_get(info, "returnOnEquity")
    if roe is None and eps is not None and current_price is not None and pb_ratio is not None and current_price > 0:
        book_value_per_share = current_price / pb_ratio
        if book_value_per_share > 0:
             roe = eps / book_value_per_share
             
    # Liquidity Fallbacks
    total_cash = _safe_get(info, "totalCash")
    total_debt = _safe_get(info, "totalDebt")
    
    cr = _safe_get(info, "currentRatio")
    if cr is None and total_cash is not None and total_debt is not None:
        if total_debt == 0 or (total_cash / total_debt) > 1.5:
            cr = 2.0  
        elif (total_cash / total_debt) > 1.0:
            cr = 1.2  

    fcf = _safe_get(info, "freeCashflow")
    if fcf is None and total_cash is not None and total_debt is not None:
        if total_cash > total_debt:
            fcf = 1  

    # ==========================================
    # 2. APPLY SCORING LOGIC
    # ==========================================
    
    # --- Pillar 1: Valuation (Max 30) ---
    if peg is not None and peg > 0:
        if peg < 1.0: score += 10
        elif peg <= 1.5: score += 5
    
    if pe is not None and pe > 0:
        if pe < 15: score += 10
        elif pe <= 25: score += 5

    if pb_ratio is not None and pb_ratio > 0:
        if pb_ratio < 1.5: score += 10
        elif pb_ratio <= 3.0: score += 5

    # --- Pillar 2: Profitability & Efficiency (Max 30) ---
    if roe is not None:
        if roe > 0.15: score += 10
        elif roe >= 0.08: score += 5

    if op_margin is not None:
        if op_margin > 0.15: score += 10
        elif op_margin >= 0.05: score += 5

    if net_margin is not None:
        if net_margin > 0.10: score += 10
        elif net_margin >= 0.05: score += 5

    # --- Pillar 3: Financial Health & Liquidity (Max 25) ---
    if is_financial:
        roa = _safe_get(info, "returnOnAssets")
        if roa is not None:
            if roa > 0.015: score += 15
            elif roa >= 0.010: score += 10

        if net_margin is not None:
            if net_margin > 0.20: score += 10
            elif net_margin > 0.10: score += 5
    else:
        if de is not None:
            if de < 50: score += 10
            elif de <= 150: score += 5
        elif total_debt == 0:
            score += 10

        if cr is not None and cr > 0:
            if cr > 1.5: score += 10
            elif cr >= 1.0: score += 5

        if fcf is not None and fcf > 0:
            score += 5

    # --- Pillar 4: Growth & Dividends (Max 15) ---
    if rev_growth is not None:
        if rev_growth > 0.10: score += 5
        elif rev_growth >= 0.0: score += 3

    if eps_growth is not None:
        if eps_growth > 0.10: score += 5
        elif eps_growth >= 0.0: score += 3
    
    if div_yield is not None:
        normalized_yield = div_yield / 100 if div_yield > 0.5 else div_yield
        if normalized_yield > 0.02 and (payout is None or payout < 0.70):
             score += 5
        elif payout is not None and payout > 0.85:
             score -= 5

    # ==========================================
    # 3. APPLY PENALTIES
    # ==========================================
    if de is not None and cr is not None:
        if de > 300 and cr < 0.8:
            score -= 20
    
    if net_margin is not None and net_margin < -0.10:
        score -= 15

    valuation_score = 0
    if peg is not None and peg < 1.0: valuation_score += 10
    elif peg is not None and peg <= 1.5: valuation_score += 5
    if pe is not None and pe < 15: valuation_score += 10
    elif pe is not None and pe <= 25: valuation_score += 5
    if pb_ratio is not None and pb_ratio < 1.5: valuation_score += 10 
    elif pb_ratio is not None and pb_ratio <= 3.0: valuation_score += 5

    if valuation_score >= 20 and rev_growth is not None and rev_growth < 0:
        score -= 10

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
            # Identification
            "symbol": info.get("symbol"),
            "shortName": _safe_get(info, "shortName", "longName", default=ticker.upper()),
            "longName": _safe_get(info, "longName", "shortName", default=""),
            "sector": _safe_get(info, "sector"),
            "industry": _safe_get(info, "industry"),
            "website": _safe_get(info, "website"),
            "description": _safe_get(info, "longBusinessSummary"),

            # Price & Market Data
            "currentPrice": _safe_get(info, "currentPrice", "regularMarketPrice"),
            "currency": _safe_get(info, "currency", default="USD"),
            "marketCap": _safe_get(info, "marketCap"),
            "enterpriseValue": _safe_get(info, "enterpriseValue"),
            "beta": _safe_get(info, "beta"),

            # Valuation Metrics
            "trailingPE": _safe_get(info, "trailingPE"),
            "forwardPE": _safe_get(info, "forwardPE"),
            "pegRatio": _safe_get(info, "pegRatio"),
            "priceToBook": _safe_get(info, "priceToBook"),
            "priceToSalesTrailing12Months": _safe_get(info, "priceToSalesTrailing12Months"),
            "enterpriseToEbitda": _safe_get(info, "enterpriseToEbitda"),

            # Profitability & Margins
            "trailingEps": _safe_get(info, "trailingEps"),
            "forwardEps": _safe_get(info, "forwardEps"),
            "returnOnEquity": _safe_get(info, "returnOnEquity"),
            "returnOnAssets": _safe_get(info, "returnOnAssets"),
            "returnOnCapitalEmployed": _safe_get(info, "returnOnCapitalEmployed", default=None),
            "grossMargins": _safe_get(info, "grossMargins"),
            "operatingMargins": _safe_get(info, "operatingMargins"),
            "profitMargins": _safe_get(info, "profitMargins"),

            # Financial Health & Cash Flow
            "debtToEquity": _safe_get(info, "debtToEquity"),
            "currentRatio": _safe_get(info, "currentRatio"),
            "quickRatio": _safe_get(info, "quickRatio"),
            "interestCoverage": _safe_get(info, "interestCoverage"),
            "totalCash": _safe_get(info, "totalCash"),
            "totalDebt": _safe_get(info, "totalDebt"),
            "freeCashflow": _safe_get(info, "freeCashflow"),
            "operatingCashflow": _safe_get(info, "operatingCashflow"),

            # Growth
            "revenueGrowth": _safe_get(info, "revenueGrowth"),
            "earningsGrowth": _safe_get(info, "earningsGrowth"),
            "revenuePerShare": _safe_get(info, "revenuePerShare"),

            # Dividends
            "dividendYield": _safe_get(info, "dividendYield"),
            "dividendRate": _safe_get(info, "dividendRate"),
            "payoutRatio": _safe_get(info, "payoutRatio"),

            # Price History & Volume
            "52WeekHigh": _safe_get(info, "fiftyTwoWeekHigh"),
            "52WeekLow": _safe_get(info, "fiftyTwoWeekLow"),
            "averageVolume": _safe_get(info, "averageVolume"),
            "volume": _safe_get(info, "volume"),

            # Analyst Sentiment
            "targetMeanPrice": _safe_get(info, "targetMeanPrice"),
            "recommendationKey": _safe_get(info, "recommendationKey"),
            "numberOfAnalystOpinions": _safe_get(info, "numberOfAnalystOpinions"),
        }

        # Chart Trends Fetching
        try:
            inc = t.income_stmt
            revenue_trend = []
            if inc is not None and not inc.empty:
                for col in list(inc.columns)[:5]:
                    year = col.year
                    rev = inc.loc['Total Revenue', col] if 'Total Revenue' in inc.index else None
                    net_inc = inc.loc['Net Income', col] if 'Net Income' in inc.index else None
                    # Use float natively or None if strictly pandas NaN
                    # We cast safely avoiding pandas na errors
                    import pandas as pd
                    rev_val = float(rev) if pd.notna(rev) else None
                    net_val = float(net_inc) if pd.notna(net_inc) else None
                    revenue_trend.append({"year": year, "revenue": rev_val, "netProfit": net_val})
        except Exception as e:
            logger.warning("Error fetching income stmt: %s", e)
            revenue_trend = []

        try:
            cf = t.cashflow
            cashflow_trend = []
            if cf is not None and not cf.empty:
                for col in list(cf.columns)[:5]:
                    year = col.year
                    op_cf = cf.loc['Operating Cash Flow', col] if 'Operating Cash Flow' in cf.index else None
                    fcf = cf.loc['Free Cash Flow', col] if 'Free Cash Flow' in cf.index else None
                    import pandas as pd
                    op_val = float(op_cf) if pd.notna(op_cf) else None
                    fcf_val = float(fcf) if pd.notna(fcf) else None
                    cashflow_trend.append({"year": year, "operatingCashFlow": op_val, "freeCashFlow": fcf_val})
        except Exception as e:
            logger.warning("Error fetching cashflow: %s", e)
            cashflow_trend = []
            
        try:
            holders = t.major_holders
            shareholding_pattern = {}
            if holders is not None and not holders.empty and 'Value' in holders.columns:
                insiders = holders.loc['insidersPercentHeld', 'Value'] if 'insidersPercentHeld' in holders.index else 0
                institutions = holders.loc['institutionsPercentHeld', 'Value'] if 'institutionsPercentHeld' in holders.index else 0
                import pandas as pd
                ins = float(insiders) if pd.notna(insiders) else 0
                inst = float(institutions) if pd.notna(institutions) else 0
                pub = max(0.0, 1.0 - ins - inst)
                shareholding_pattern = {
                    "promoters": ins,
                    "institutions": inst,
                    "public": pub
                }
        except Exception as e:
            logger.warning("Error fetching holders: %s", e)
            shareholding_pattern = {}

        data["revenueTrend"] = revenue_trend[::-1] if revenue_trend else [] # Oldest to newest
        data["cashflowTrend"] = cashflow_trend[::-1] if cashflow_trend else []
        data["shareholdingPattern"] = shareholding_pattern

        score = _compute_fundamental_score(info)
        return {
            "data": data,
            "score": score,
        }
    except Exception as e:
        logger.exception("get_fundamental_analysis failed for %s: %s", ticker, e)
        return None
