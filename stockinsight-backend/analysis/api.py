"""
Analysis API: single entry point for the frontend. GET /api/analysis/{ticker}/
"""
from django.http import JsonResponse
from ninja import Router

from analysis.search import search_companies
from analysis.services import run_full_analysis
from technical.services import get_chart_data

router = Router(tags=["analysis"])


def _require_authenticated_user(request):
    if request.user.is_authenticated:
        return None
    return JsonResponse({"error": "Sign in to access stock analysis."}, status=401)


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
    unauthorized_response = _require_authenticated_user(request)
    if unauthorized_response is not None:
        return unauthorized_response

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
    unauthorized_response = _require_authenticated_user(request)
    if unauthorized_response is not None:
        return unauthorized_response

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
    unauthorized_response = _require_authenticated_user(request)
    if unauthorized_response is not None:
        return unauthorized_response

    return {
        "query": q.strip(),
        "suggestions": search_companies(q, limit=limit),
    }
