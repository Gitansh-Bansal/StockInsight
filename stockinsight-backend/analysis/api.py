"""
Analysis API: single entry point for the frontend. GET /api/analysis/{ticker}/
"""
from typing import Any

from ninja import Router, Schema

from analysis.search import search_companies
from analysis.services import run_full_analysis, run_parallel_comparison
from technical.services import get_chart_data
from reports.services import generate_report_bundle

router = Router(tags=["analysis"])


class CompareRequest(Schema):
    tickers: list[str]


class ReportRequest(Schema):
    ticker: str
    fundamental_result: dict[str, Any] | None = None
    technical_result: dict[str, Any] | None = None
    sentiment_result: dict[str, Any] | None = None
    overall_score: float
    verdict: str


@router.post("/analysis/report")
def generate_report_endpoint(request, payload: ReportRequest):
    """
    Stateless endpoint to generate the LLM report using provided analysis data.
    """
    return generate_report_bundle(
        ticker=payload.ticker,
        fundamental_result=payload.fundamental_result,
        technical_result=payload.technical_result,
        sentiment_result=payload.sentiment_result,
        overall_score=payload.overall_score,
        verdict=payload.verdict
    )


@router.post("/analysis/compare")
def compare_stocks(request, payload: CompareRequest):
    """
    Run full analysis for multiple tickers concurrently.
    Reports are skipped for speed; use the single-ticker endpoint for full reports.
    """
    tickers = payload.tickers[:10]  # cap at 10
    if not tickers:
        return {"results": {}}
    return run_parallel_comparison(tickers)


@router.get("/analysis/{ticker}")
def get_analysis(
    request,
    ticker: str,
    include_report: bool = True,
):
    """
    Run full analysis for the given ticker and return overview, fundamental,
    technical, sentiment, and optional comprehensive report.
    """
    result = run_full_analysis(
        ticker=ticker,
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
    return get_chart_data(ticker=ticker, duration=duration)


@router.get("/search")
def search_symbols(
    request,
    q: str = "",
    limit: int = 8,
):
    """
    Return company/ticker suggestions for the search bar.
    """
    return {
        "query": q.strip(),
        "suggestions": search_companies(q, limit=limit),
    }

