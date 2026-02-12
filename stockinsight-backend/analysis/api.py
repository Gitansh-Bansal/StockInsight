"""
Analysis API: single entry point for the frontend. GET /api/analysis/{ticker}/
"""
from ninja import Router

from analysis.services import run_full_analysis

router = Router(tags=["analysis"])


@router.get("/analysis/{ticker}")
def get_analysis(request, ticker: str, period: str = "1y"):
    """
    Run full analysis for the given ticker and return overview, fundamental,
    technical, sentiment, and comprehensive report. period: 1mo, 3mo, 6mo, 1y, 2y, 5y.
    """
    result = run_full_analysis(ticker, period=period)
    if result is None:
        return {"error": "Ticker not found or invalid"}, 404
    return result
