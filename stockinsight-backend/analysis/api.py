"""
Analysis API: single entry point for the frontend. GET /api/analysis/{ticker}/
"""
from ninja import Router

from analysis.services import run_full_analysis
from technical.services import get_chart_data

router = Router(tags=["analysis"])


@router.get("/analysis/{ticker}")
def get_analysis(
    request,
    ticker: str,
    period: str = "1y",
    include_report: bool = True,
):
    """
    Run full analysis for the given ticker and return overview, fundamental,
    technical, sentiment, and optional comprehensive report.
    period: 1mo, 3mo, 6mo, 1y, 2y, 5y.
    """
    result = run_full_analysis(
        ticker=ticker,
        period=period,
        include_report=include_report,
    )
    if result is None:
        return {"error": "Ticker not found or invalid"}, 404
    return result

@router.get("/analysis/chart/{ticker}")
def fetch_chart(
    request,
    ticker: str,
    duration: str = "1Y",
):
    """
    Fetch specific fine-grained chart data based on duration.
    """
    data = get_chart_data(ticker=ticker, duration=duration)
    return {"ohlcv": data}
