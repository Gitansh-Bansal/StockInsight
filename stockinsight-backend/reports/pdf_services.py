"""
PDF report rendering with WeasyPrint.

This module builds a 4-page A4 stock report:
1) Executive summary and key indicators
2) Fundamental analysis
3) Technical analysis
4) Sentiment analysis
"""
from __future__ import annotations

from datetime import UTC, datetime
from html import escape
from math import cos, sin
import os
import re
from typing import Any


def _configure_weasyprint_windows_runtime() -> None:
    """
    Configure DLL lookup paths for WeasyPrint on Windows.

    WeasyPrint's Python package depends on system libraries (Pango/Cairo/GTK).
    On Windows these are often installed via MSYS2 and may not be on PATH.
    """
    if os.name != "nt":
        return

    if os.environ.get("WEASYPRINT_DLL_DIRECTORIES"):
        return

    candidate_dirs = [
        r"C:\msys64\mingw64\bin",
        r"C:\msys64\ucrt64\bin",
        r"C:\Program Files\GTK3-Runtime Win64\bin",
        r"C:\Program Files\GTK3-Runtime\bin",
    ]
    existing_dirs = [path for path in candidate_dirs if os.path.isdir(path)]
    if not existing_dirs:
        return

    os.environ["WEASYPRINT_DLL_DIRECTORIES"] = ";".join(existing_dirs)

    # Some Windows setups still rely on PATH-based lookup for dependent DLLs.
    current_path = os.environ.get("PATH", "")
    path_parts = [part for part in current_path.split(";") if part]
    missing_in_path = [path for path in existing_dirs if path not in path_parts]
    if missing_in_path:
        os.environ["PATH"] = ";".join([*missing_in_path, current_path]).strip(";")
    add_dll_directory = getattr(os, "add_dll_directory", None)
    if add_dll_directory:
        for path in existing_dirs:
            try:
                add_dll_directory(path)
            except OSError:
                continue


def render_analysis_pdf(analysis_payload: dict[str, Any]) -> bytes:
    """
    Render a 4-page analysis report as PDF bytes using WeasyPrint.
    """
    _configure_weasyprint_windows_runtime()

    try:
        from weasyprint import HTML  # type: ignore
    except ModuleNotFoundError as exc:
        if exc.name == "weasyprint":
            raise RuntimeError(
                "WeasyPrint Python package is missing. "
                "Install dependencies with `pip install -r requirements.txt`."
            ) from exc
        raise RuntimeError("WeasyPrint is unavailable due to a missing Python dependency.") from exc
    except Exception as exc:
        raise RuntimeError(
            "WeasyPrint could not load native system libraries. "
            "On Windows, install MSYS2 and `mingw-w64-x86_64-pango`, then set "
            "`WEASYPRINT_DLL_DIRECTORIES` (for example `C:\\msys64\\mingw64\\bin`) "
            "and verify with `python -m weasyprint --info`."
        ) from exc

    html = _build_report_html(analysis_payload)
    try:
        return HTML(string=html).write_pdf()
    except AttributeError as exc:
        if "transform" in str(exc):
            raise RuntimeError(
                "Incompatible WeasyPrint runtime detected (likely `pydyf>=0.12` with "
                "`weasyprint==62.3`). Pin `pydyf==0.11.0` and reinstall requirements."
            ) from exc
        raise


def _build_report_html(analysis_payload: dict[str, Any]) -> str:
    ticker = str(analysis_payload.get("ticker") or "N/A").upper()
    overview = analysis_payload.get("overview") or {}
    fundamental_result = analysis_payload.get("fundamental") or {}
    technical_result = analysis_payload.get("technical") or {}
    sentiment_result = analysis_payload.get("sentiment") or {}
    report_sections = analysis_payload.get("reportSections") or {}

    fundamental = fundamental_result.get("data") or {}
    technical = technical_result or {}
    indicators = technical.get("indicators") or {}
    structure = technical.get("structure") or {}
    ohlcv = technical.get("ohlcv") or []
    headlines = sentiment_result.get("headlines") or []

    company_name = _safe_text(
        fundamental.get("shortName") or fundamental.get("longName") or ticker
    )
    currency = _normalize_currency(
        fundamental.get("currency") or technical.get("currency") or "USD"
    )

    report_date = datetime.now(UTC)
    generated_human = report_date.strftime("%B %d, %Y")

    overview_score = _to_float(overview.get("overallScore"))
    predicted_score = _to_float(overview.get("predictedScore"))
    fundamental_score = _to_float(overview.get("fundamentalScore"))
    technical_score = _to_float(overview.get("technicalScore"))
    sentiment_score = _to_float(overview.get("sentimentScore") or sentiment_result.get("score"))

    overall_summary = _extract_summary_text(
        report_sections.get("overall"),
        default=(
            f"{ticker} has an overall score of {_format_score(overview_score)} "
            f"with verdict {_safe_text(overview.get('verdict'))}."
        ),
    )
    fundamental_bullets = _extract_bullets(
        report_sections.get("fundamental"),
        default_text="Fundamental insights are currently unavailable.",
        max_items=6,
    )
    technical_bullets = _extract_bullets(
        report_sections.get("technical"),
        default_text="Technical insights are currently unavailable.",
        max_items=6,
    )
    sentiment_bullets = _extract_bullets(
        report_sections.get("sentiment"),
        default_text="Sentiment insights are currently unavailable.",
        max_items=7,
    )
    risk_bullets = _extract_bullets(
        report_sections.get("riskFactors"),
        default_text="Macro conditions, execution risk, and market volatility remain key watch factors.",
        max_items=6,
    )

    revenue_chart_svg = _build_fundamental_chart_svg(fundamental.get("revenueTrend"))
    sentiment_counts = _build_sentiment_counts(headlines)
    total_headlines = _to_int((sentiment_result.get("data") or {}).get("count"))
    total_headline_count = total_headlines if total_headlines is not None else len(headlines)

    exchange_name = _safe_text(
        fundamental.get("fullExchangeName") or fundamental.get("exchange") or "N/A"
    )
    if exchange_name == "N/A":
        exchange_name = "NASDAQ"

    current_price = _to_float(fundamental.get("currentPrice") or indicators.get("close"))
    price_change_pct = _compute_price_change_percent(ohlcv)
    price_change_label = _format_signed_percent(price_change_pct)
    price_change_class = (
        "score-up" if (price_change_pct is not None and price_change_pct >= 0) else "score-down"
    )

    key_metric_rows = [
        ("Revenue", _format_large_number_symbol(_latest_trend_value(fundamental.get("revenueTrend"), "revenue"), currency)),
        ("Net Profit", _format_large_number_symbol(_latest_trend_value(fundamental.get("revenueTrend"), "netProfit"), currency)),
        ("Operating Margin", _format_percent(fundamental.get("operatingMargins"))),
        ("P/E (TTM)", _format_number(fundamental.get("trailingPE"))),
        ("Gross Margin", _format_percent(fundamental.get("grossMargins"))),
    ]
    key_metric_rows_html = _build_single_column_rows(key_metric_rows)

    shareholding = fundamental.get("shareholdingPattern") or {}
    institutional_share = _to_float(shareholding.get("institutions")) or 0.0
    public_share = _to_float(shareholding.get("public")) or 0.0
    promoter_share = _to_float(shareholding.get("promoters")) or 0.0
    shareholding_svg = _build_shareholding_donut_svg(
        institutional_share,
        public_share,
        promoter_share,
    )
    ownership_rows_html = _build_single_column_rows(
        [
            ("Institutional", _format_percent_share(institutional_share)),
            ("Retail / Public", _format_percent_share(public_share)),
            ("Promoter", _format_percent_share(promoter_share)),
            ("Analyst Coverage", f"{_format_int(fundamental.get('numberOfAnalystOpinions'))} Analysts"),
        ]
    )

    profitability_rows_html = _build_single_column_rows(
        [
            ("Gross Margin", _format_percent(fundamental.get("grossMargins"))),
            ("Operating Margin", _format_percent(fundamental.get("operatingMargins"))),
            ("Net Profit Margin", _format_percent(fundamental.get("profitMargins"))),
            ("Return on Equity", _format_percent(fundamental.get("returnOnEquity"))),
            ("Return on Assets", _format_percent(fundamental.get("returnOnAssets"))),
            ("EPS (Diluted)", _format_currency_symbol(fundamental.get("trailingEps"), currency)),
        ]
    )
    financial_health_rows_html = _build_single_column_rows(
        [
            ("Total Cash", _format_large_number_symbol(fundamental.get("totalCash"), currency)),
            ("Total Debt", _format_large_number_symbol(fundamental.get("totalDebt"), currency)),
            ("Debt / Equity", _format_number(fundamental.get("debtToEquity"))),
            ("Current Ratio", _format_number(fundamental.get("currentRatio"))),
            ("Quick Ratio", _format_number(fundamental.get("quickRatio"))),
            ("Interest Coverage", _format_number(fundamental.get("interestCoverage"))),
        ]
    )

    growth_cards_html = _build_growth_cards_html(
        [
            ("Revenue Growth", _format_percent(fundamental.get("revenueGrowth")), "YoY"),
            ("Earnings Growth", _format_percent(fundamental.get("earningsGrowth")), "YoY"),
            ("Dividend Yield", _format_percent(fundamental.get("dividendYield")), "Annual"),
            ("Payout Ratio", _format_percent(fundamental.get("payoutRatio")), "Dividends / EPS"),
            ("Beta (5Y)", _format_number(fundamental.get("beta")), "Market Sensitivity"),
            ("Market Cap", _format_large_number_symbol(fundamental.get("marketCap"), currency), "Total"),
            ("Enterprise Value", _format_large_number_symbol(fundamental.get("enterpriseValue"), currency), "EV"),
            ("Analyst Opinions", _format_int(fundamental.get("numberOfAnalystOpinions")), "Coverage Count"),
        ]
    )

    cashflow_rows_html = _build_cashflow_rows(
        fundamental.get("cashflowTrend"),
        currency=currency,
    )
    peers = []
    sector_peers_analysis = fundamental.get("sectorPeersAnalysis")
    if isinstance(sector_peers_analysis, dict):
        peers_raw = sector_peers_analysis.get("peers")
        if isinstance(peers_raw, list):
            peers = [str(item).upper() for item in peers_raw if str(item).strip()][:4]
    peers_text = ", ".join(peers) if peers else "N/A"

    sector_profile_rows_html = _build_single_column_rows(
        [
            ("Sector", _safe_text(fundamental.get("sector"))),
            ("Industry", _safe_text(fundamental.get("industry"))),
            ("Website", _safe_text(fundamental.get("website"))),
            ("Peers", peers_text),
        ]
    )

    support_values = _safe_list_numbers(structure.get("support"))[:3]
    resistance_values = _safe_list_numbers(structure.get("resistance"))[:3]
    support_resistance_rows_html = _build_support_resistance_rows(
        support_values=support_values,
        resistance_values=resistance_values,
        currency=currency,
    )
    momentum_rows_html = _build_single_column_rows(
        [
            ("MACD", _format_number(indicators.get("MACD"), decimals=4)),
            ("MACD Signal", _format_number(indicators.get("MACD_signal"), decimals=4)),
            ("ADX", _format_number(indicators.get("ADX"))),
            ("Signal", _safe_text(technical.get("signal"))),
            ("Trend", _safe_text(technical.get("trend"))),
        ]
    )
    fibonacci_rows_html = _build_fibonacci_rows(
        structure.get("fibonacciLevels"),
        currency=currency,
    )
    technical_reasons = technical.get("reasons")
    if not isinstance(technical_reasons, list):
        technical_reasons = []
    if not technical_reasons:
        technical_reasons = [
            "Watch trend direction and moving average alignment.",
            "Monitor momentum divergence in RSI and MACD.",
        ]
    signals_html = "".join(
        f"<li>{escape(str(item))}</li>" for item in technical_reasons[:6]
    )

    headline_rows_html = _build_headline_feed_rows(headlines)
    verdict_text = _safe_text(overview.get("verdict"))
    price_label = _format_currency_symbol(current_price, currency)
    market_cap_label = _format_large_number_symbol(fundamental.get("marketCap"), currency)
    target_price_label = _format_currency_symbol(fundamental.get("targetMeanPrice"), currency)

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>{escape(ticker)} StockInsight Report</title>
  <style>
    @page {{
      size: A4;
      margin: 7mm 8mm;
      background: #ffffff;
    }}

    :root {{
      --page-bg: #ffffff;
      --panel-bg: #f4f9ff;
      --panel-strong: #ffffff;
      --panel-border: #c9dcf0;
      --text-main: #172b42;
      --text-muted: #5f738f;
      --text-heading: #0f4c81;
      --table-border: #d0e1f3;
      --accent-green: #22c55e;
      --accent-amber: #f59e0b;
      --accent-red: #ef4444;
    }}

    html, body {{
      margin: 0;
      padding: 0;
      background: var(--page-bg);
      color: #0f172a;
      font-family: "Segoe UI", Arial, sans-serif;
      font-size: 11px;
      line-height: 1.34;
    }}

    .page {{
      page-break-after: always;
    }}

    .page:last-child {{
      page-break-after: auto;
    }}

    .sheet {{
      display: block;
      box-sizing: border-box;
    }}

    .sheet-main {{
      box-sizing: border-box;
    }}

    .top-grid {{
      display: grid;
      grid-template-columns: 1.25fr 0.9fr 0.95fr 1.2fr 0.95fr;
      gap: 8px;
      margin-bottom: 8px;
    }}

    .hero-card {{
      background: var(--panel-bg);
      border: 1px solid var(--panel-border);
      border-radius: 12px;
      padding: 11px 12px;
      color: var(--text-main);
      min-height: 68px;
      box-sizing: border-box;
      overflow: hidden;
    }}

    .hero-company {{
      font-size: 22px;
      font-weight: 700;
      line-height: 1.1;
      margin: 0;
    }}

    .hero-exchange {{
      margin-top: 7px;
      font-size: 12px;
      color: var(--text-heading);
      font-weight: 700;
      letter-spacing: 0.2px;
    }}

    .hero-k-label {{
      margin: 4px 0 0;
      color: var(--text-heading);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }}

    .hero-k-value {{
      margin: 2px 0 0;
      font-size: 22px;
      font-weight: 700;
      overflow-wrap: anywhere;
    }}

    .score-down {{
      margin-top: 2px;
      color: var(--accent-red);
      font-size: 12px;
      font-weight: 700;
    }}

    .score-up {{
      margin-top: 2px;
      color: var(--accent-green);
      font-size: 12px;
      font-weight: 700;
    }}

    .score-block-title {{
      margin: 2px 0 0;
      color: var(--text-heading);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }}

    .score-block-value {{
      margin: 3px 0 0;
      font-size: 19px;
      font-weight: 800;
      color: {escape(_score_badge_bg(overview_score))};
    }}

    .panel {{
      background: var(--panel-bg);
      border: 1px solid var(--panel-border);
      border-radius: 12px;
      padding: 10px 14px;
      color: var(--text-main);
      margin-bottom: 8px;
      box-sizing: border-box;
      overflow: hidden;
    }}

    .panel h2, .panel h3 {{
      margin: 0 0 6px 0;
      color: var(--text-heading);
      letter-spacing: 0.2px;
      line-height: 1.2;
    }}

    .panel h2 {{
      font-size: 21px;
      color: #0f172a;
    }}

    .panel h3 {{
      font-size: 13px;
      text-transform: uppercase;
      font-weight: 800;
    }}

    .summary-text {{
      margin: 0;
      color: #334155;
      font-size: 11px;
      line-height: 1.32;
    }}

    .muted {{
      color: var(--text-muted);
      font-style: italic;
    }}

    .header-row {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 8px;
    }}

    .header-left {{
      min-width: 0;
    }}

    .header-sub {{
      margin-top: 2px;
      color: #5f738f;
      font-size: 11px;
      font-weight: 600;
    }}

    .badge {{
      display: inline-block;
      border-radius: 999px;
      padding: 4px 12px;
      font-weight: 800;
      color: #ffffff;
      font-size: 11px;
    }}

    .two-col {{
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 8px;
    }}

    .two-col-wide-right {{
      display: grid;
      grid-template-columns: 0.9fr 1.35fr;
      gap: 8px;
      margin-bottom: 8px;
    }}

    .three-col {{
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 8px;
      margin-bottom: 8px;
    }}

    .chart-wrap {{
      background: var(--panel-strong);
      border: 1px solid var(--table-border);
      border-radius: 10px;
      padding: 6px;
      overflow: hidden;
      box-sizing: border-box;
    }}

    .chart-wrap svg,
    .score-card svg {{
      display: block;
      width: 100% !important;
      max-width: 100%;
      height: auto;
    }}

    .panel-table {{
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 9px;
      margin-top: 2px;
      background: #ffffff;
      max-width: 100%;
    }}

    .panel-table th,
    .panel-table td {{
      border: 1px solid var(--table-border);
      padding: 4px 6px;
      color: #1f4b7a;
      vertical-align: middle;
      word-break: break-word;
      overflow-wrap: anywhere;
    }}

    .panel-table th {{
      color: #0f172a;
      text-align: left;
      font-size: 8.5px;
      background: #eef5fd;
    }}

    .panel-table td:last-child {{
      color: #111827;
      text-align: right;
      font-weight: 700;
    }}

    .chip-grid {{
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 7px;
    }}

    .chip {{
      background: var(--panel-strong);
      border: 1px solid var(--table-border);
      border-radius: 9px;
      padding: 7px 9px;
      min-height: 48px;
    }}

    .chip-label {{
      margin: 0;
      color: var(--text-heading);
      font-size: 8px;
      font-weight: 700;
      text-transform: uppercase;
    }}

    .chip-value {{
      margin: 2px 0 0 0;
      color: #0f172a;
      font-size: 11px;
      font-weight: 800;
      line-height: 1.2;
    }}

    .chip-note {{
      margin: 2px 0 0 0;
      color: #5f738f;
      font-size: 7px;
      font-weight: 600;
      text-transform: uppercase;
    }}

    .score-cards {{
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
      margin-bottom: 8px;
    }}

    .score-card {{
      background: var(--panel-bg);
      border: 1px solid var(--panel-border);
      border-radius: 12px;
      padding: 9px 8px;
      text-align: center;
      box-sizing: border-box;
      overflow: hidden;
    }}

    .score-title {{
      margin: 0 0 4px;
      color: var(--text-heading);
      font-size: 8px;
      font-weight: 800;
      letter-spacing: 0.4px;
      text-transform: uppercase;
    }}

    .score-svg {{
      width: 100%;
      height: 82px;
      display: block;
    }}

    .sentiment-counts {{
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 8px;
      margin-top: 2px;
    }}

    .sentiment-box {{
      border-radius: 10px;
      padding: 8px 8px 7px;
      text-align: center;
      border: 1px solid #d9e3ef;
    }}

    .sentiment-box .num {{
      margin: 0;
      font-size: 16px;
      font-weight: 800;
      line-height: 1;
    }}

    .sentiment-box .lbl {{
      margin: 3px 0 0;
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.3px;
      text-transform: uppercase;
      color: #46576f;
    }}

    .headline-list {{
      background: #ffffff;
      border: 1px solid var(--table-border);
      border-radius: 10px;
      padding: 4px 8px;
      box-sizing: border-box;
      overflow: hidden;
    }}

    .headline-row {{
      display: grid;
      grid-template-columns: 10px 1fr auto;
      align-items: center;
      gap: 6px;
      padding: 4px 0;
      border-bottom: 1px solid #dbe7f5;
      color: #1f2937;
      font-size: 7px;
      line-height: 1.25;
      overflow: hidden;
    }}

    .headline-row:last-child {{
      border-bottom: none;
    }}

    .dot {{
      width: 6px;
      height: 6px;
      border-radius: 50%;
      display: inline-block;
    }}

    .dot-pos {{ background: #22c55e; }}
    .dot-neg {{ background: #ef4444; }}
    .dot-neu {{ background: #f59e0b; }}

    .headline-source {{
      color: #5f738f;
      font-weight: 600;
      white-space: nowrap;
      margin-left: 8px;
    }}

    .bullet-list {{
      margin: 0;
      padding-left: 14px;
    }}

    .bullet-list li {{
      margin: 2px 0;
      color: #334155;
      font-size: 8px;
      line-height: 1.28;
    }}

    .text-good {{ color: #22c55e !important; }}
    .text-bad {{ color: #ef4444 !important; }}

    .sheet-footer {{
      margin-top: 6px;
      color: #64748b;
      font-size: 8px;
      font-weight: 600;
    }}
  </style>
</head>
<body>
  <section class="page">
    <div class="sheet">
      <div class="sheet-main">
        <div class="top-grid">
          <div class="hero-card">
            <p class="hero-company">{escape(company_name)}<br/>({escape(ticker)})</p>
            <div class="hero-exchange">{escape(exchange_name)}</div>
          </div>
          <div class="hero-card">
            <p class="hero-k-value">{escape(price_label)}</p>
            <p class="{price_change_class}">{escape(price_change_label)}</p>
          </div>
          <div class="hero-card">
            <p class="hero-k-label">Market Cap</p>
            <p class="hero-k-value">{escape(market_cap_label)}</p>
          </div>
          <div class="hero-card">
            <p class="score-block-title">Overall &amp; Prediction</p>
            <p class="hero-k-value" style="font-size:13px;">Score: {escape(_format_short_score(overview_score))}</p>
            <p class="score-block-value">{escape(verdict_text)} (ML: {escape(_format_short_score(predicted_score))})</p>
          </div>
          <div class="hero-card">
            <p class="hero-k-label">Target Price</p>
            <p class="hero-k-value">{escape(target_price_label)}</p>
          </div>
        </div>

        <div class="panel">
          <h3>Executive Briefing</h3>
          <p class="summary-text">{escape(overall_summary)}</p>
        </div>

        <div class="two-col-wide-right">
          <div class="panel">
            <h3>Revenue &amp; Profit Trend</h3>
            <div class="chart-wrap">{revenue_chart_svg}</div>
          </div>
          <div class="panel">
            <h3>Key Performance Metrics</h3>
            <table class="panel-table">
              <tbody>
                {key_metric_rows_html}
              </tbody>
            </table>
          </div>
        </div>

        <div class="two-col">
          <div class="panel">
            <h3>Shareholding Pattern</h3>
            <div class="chart-wrap">{shareholding_svg}</div>
          </div>
          <div class="panel">
            <h3>Ownership Insights</h3>
            <table class="panel-table">
              <tbody>
                {ownership_rows_html}
              </tbody>
            </table>
          </div>
        </div>

        <div class="score-cards">
          <div class="score-card">
            <p class="score-title">Fundamental</p>
            {_build_score_gauge_svg(fundamental_score)}
          </div>
          <div class="score-card">
            <p class="score-title">Technical</p>
            {_build_score_gauge_svg(technical_score)}
          </div>
          <div class="score-card">
            <p class="score-title">Sentiment</p>
            {_build_score_gauge_svg(sentiment_score)}
          </div>
        </div>

        <div class="panel">
          <h3>Risk Factors</h3>
          <ul class="bullet-list">
            {_build_bullet_items(risk_bullets)}
          </ul>
        </div>
      </div>
      <div class="sheet-footer">Generated {escape(generated_human)} - Page 1 of 4 - StockInsight Report - For informational purposes only.</div>
    </div>
  </section>

  <section class="page">
    <div class="sheet">
      <div class="sheet-main">
        <div class="panel">
          <div class="header-row">
            <div class="header-left">
              <h2>Fundamental Analysis</h2>
              <div class="header-sub">{escape(company_name)} ({escape(ticker)}) - {escape(exchange_name)} - {escape(generated_human)}</div>
            </div>
            <span class="badge" style="background:{escape(_score_badge_bg(fundamental_score))};">Score: {escape(_format_short_score(fundamental_score))}</span>
          </div>
        </div>

        <div class="panel">
          <h3>Fundamental Analysis Summary</h3>
          <ul class="bullet-list">
            {_build_bullet_items(fundamental_bullets)}
          </ul>
        </div>

        <div class="two-col">
          <div class="panel">
            <h3>Profitability &amp; Returns</h3>
            <table class="panel-table">
              <tbody>
                {profitability_rows_html}
              </tbody>
            </table>
          </div>
          <div class="panel">
            <h3>Financial Health</h3>
            <table class="panel-table">
              <tbody>
                {financial_health_rows_html}
              </tbody>
            </table>
          </div>
        </div>

        <div class="panel">
          <h3>Growth &amp; Dividends</h3>
          <div class="chip-grid">
            {growth_cards_html}
          </div>
        </div>

        <div class="two-col">
          <div class="panel">
            <h3>Cash Flow Trend</h3>
            <table class="panel-table">
              <thead>
                <tr>
                  <th style="width:20%;">Year</th>
                  <th style="width:40%; text-align:right;">Op. Cash</th>
                  <th style="width:40%; text-align:right;">Free Cash</th>
                </tr>
              </thead>
              <tbody>
                {cashflow_rows_html}
              </tbody>
            </table>
          </div>
          <div class="panel">
            <h3>Sector &amp; Profile</h3>
            <table class="panel-table">
              <tbody>
                {sector_profile_rows_html}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="sheet-footer">Generated {escape(generated_human)} - Page 2 of 4 - StockInsight Report - For informational purposes only.</div>
    </div>
  </section>

  <section class="page">
    <div class="sheet">
      <div class="sheet-main">
        <div class="panel">
          <div class="header-row">
            <div class="header-left">
              <h2>Technical Analysis</h2>
              <div class="header-sub">{escape(company_name)} ({escape(ticker)}) - {escape(exchange_name)} - {escape(generated_human)}</div>
            </div>
            <span class="badge" style="background:{escape(_score_badge_bg(technical_score))};">Score: {escape(_format_short_score(technical_score))}</span>
          </div>
        </div>

        <div class="panel">
          <h3>Technical Analysis Summary</h3>
          <ul class="bullet-list">
            {_build_bullet_items(technical_bullets)}
          </ul>
        </div>

        <div class="panel">
          <h3>Price Snapshot &amp; Regime</h3>
          <div class="chip-grid">
            {_build_growth_cards_html([
              ("Last Close", _format_currency_symbol(indicators.get("close"), currency), "Current Price"),
              ("52W High", _format_currency_symbol(indicators.get("52WeekHigh"), currency), "52-Week High"),
              ("52W Low", _format_currency_symbol(indicators.get("52WeekLow"), currency), "52-Week Low"),
              ("SMA 20", _format_currency_symbol(indicators.get("SMA20"), currency), "20-day Moving Avg"),
              ("SMA 50", _format_currency_symbol(indicators.get("SMA50"), currency), "50-day Moving Avg"),
              ("SMA 200", _format_currency_symbol(indicators.get("SMA200"), currency), "200-day Moving Avg"),
              ("RSI (14)", _format_number(indicators.get("RSI"), decimals=1), "Relative Strength"),
              ("ATR", _format_number(indicators.get("ATR")), "Avg True Range"),
            ])}
          </div>
        </div>

        <div class="two-col">
          <div class="panel">
            <h3>Momentum Indicators</h3>
            <table class="panel-table">
              <tbody>
                {momentum_rows_html}
              </tbody>
            </table>
          </div>
          <div class="panel">
            <h3>Support &amp; Resistance</h3>
            <table class="panel-table">
              <thead>
                <tr>
                  <th style="width:60%;">Level</th>
                  <th style="width:40%; text-align:right;">Price</th>
                </tr>
              </thead>
              <tbody>
                {support_resistance_rows_html}
              </tbody>
            </table>
          </div>
        </div>

        <div class="two-col">
          <div class="panel">
            <h3>Key Technical Signals</h3>
            <ul class="bullet-list">
              {signals_html}
            </ul>
          </div>
          <div class="panel">
            <h3>Volume &amp; Structure Analysis</h3>
            <table class="panel-table">
              <tbody>
                <tr><td>Breakout Detected</td><td>{escape(_safe_text(structure.get("breakout")))}</td></tr>
                <tr><td>Volume Spike</td><td>{escape(_format_bool(structure.get("volumeSpike")))}</td></tr>
                <tr><th colspan="2" style="text-align:center;">Fibonacci Levels</th></tr>
                {fibonacci_rows_html}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="sheet-footer">Generated {escape(generated_human)} - Page 3 of 4 - StockInsight Report - For informational purposes only.</div>
    </div>
  </section>

  <section class="page">
    <div class="sheet">
      <div class="sheet-main">
        <div class="panel">
          <div class="header-row">
            <div class="header-left">
              <h2>Sentiment Analysis</h2>
              <div class="header-sub">{escape(company_name)} ({escape(ticker)}) - {escape(exchange_name)} - {escape(generated_human)}</div>
            </div>
            <span class="badge" style="background:{escape(_score_badge_bg(sentiment_score))};">Score: {escape(_format_short_score(sentiment_score))}</span>
          </div>
        </div>

        <div class="panel">
          <h3>Sentiment Analysis Summary</h3>
          <ul class="bullet-list">
            {_build_bullet_items(sentiment_bullets)}
          </ul>
        </div>

        <div class="panel">
          <h3>News Sentiment Overview</h3>
          <div class="sentiment-counts">
            <div class="sentiment-box" style="background:#dff4e2;">
              <p class="num" style="color:#198f49;">{sentiment_counts["positive"]}</p>
              <p class="lbl">Positive</p>
            </div>
            <div class="sentiment-box" style="background:#fbf4cb;">
              <p class="num" style="color:#9a4c0f;">{sentiment_counts["neutral"]}</p>
              <p class="lbl">Neutral</p>
            </div>
            <div class="sentiment-box" style="background:#fde2e2;">
              <p class="num" style="color:#dc2626;">{sentiment_counts["negative"]}</p>
              <p class="lbl">Negative</p>
            </div>
            <div class="sentiment-box" style="background:#f2f5f9;">
              <p class="num" style="color:#334155;">{total_headline_count}</p>
              <p class="lbl">Total Articles</p>
            </div>
          </div>
        </div>

        <div class="panel">
          <h3>Recent News Headlines</h3>
          <div class="headline-list">
            {headline_rows_html}
          </div>
        </div>
      </div>
      <div class="sheet-footer">Generated {escape(generated_human)} - Page 4 of 4 - StockInsight Report - For informational purposes only.</div>
    </div>
  </section>
</body>
</html>"""


def _build_growth_cards_html(items: list[tuple[str, str, str]]) -> str:
    return "".join(
        "<div class=\"chip\">"
        f"<p class=\"chip-label\">{escape(label)}</p>"
        f"<p class=\"chip-value\">{escape(value)}</p>"
        f"<p class=\"chip-note\">{escape(note)}</p>"
        "</div>"
        for label, value, note in items
    )


def _latest_trend_value(trend_rows: Any, key: str) -> float | None:
    if not isinstance(trend_rows, list):
        return None
    for row in reversed(trend_rows):
        if isinstance(row, dict):
            value = _to_float(row.get(key))
            if value is not None:
                return value
    return None


def _build_cashflow_rows(cashflow_rows: Any, currency: str) -> str:
    if not isinstance(cashflow_rows, list) or not cashflow_rows:
        return (
            "<tr><td>N/A</td><td>N/A</td><td>N/A</td></tr>"
        )
    rows: list[str] = []
    for row in cashflow_rows[-5:]:
        if not isinstance(row, dict):
            continue
        year = str(row.get("year") or "N/A")
        op_cash = _format_large_number_symbol(row.get("operatingCashFlow"), currency)
        free_cash = _format_large_number_symbol(row.get("freeCashFlow"), currency)
        rows.append(
            "<tr>"
            f"<td>{escape(year)}</td>"
            f"<td>{escape(op_cash)}</td>"
            f"<td>{escape(free_cash)}</td>"
            "</tr>"
        )
    return "".join(rows) or "<tr><td>N/A</td><td>N/A</td><td>N/A</td></tr>"


def _build_support_resistance_rows(
    support_values: list[float],
    resistance_values: list[float],
    currency: str,
) -> str:
    rows: list[str] = []
    for idx, value in enumerate(resistance_values, start=1):
        rows.append(
            "<tr>"
            f"<td>Resistance {idx}</td>"
            f"<td class=\"text-bad\">{escape(_format_currency_symbol(value, currency))}</td>"
            "</tr>"
        )
    for idx, value in enumerate(support_values, start=1):
        rows.append(
            "<tr>"
            f"<td>Support {idx}</td>"
            f"<td class=\"text-good\">{escape(_format_currency_symbol(value, currency))}</td>"
            "</tr>"
        )
    if not rows:
        return "<tr><td>N/A</td><td>N/A</td></tr>"
    return "".join(rows)


def _build_fibonacci_rows(levels: Any, currency: str) -> str:
    if not isinstance(levels, dict) or not levels:
        return "<tr><td>Level</td><td>N/A</td></tr>"
    order = ["0.236", "0.382", "0.5", "0.618"]
    rows: list[str] = []
    for label in order:
        value = _to_float(levels.get(label))
        rows.append(
            "<tr>"
            f"<td>Level {label}</td>"
            f"<td>{escape(_format_currency_symbol(value, currency))}</td>"
            "</tr>"
        )
    return "".join(rows)


def _build_headline_feed_rows(headlines: Any) -> str:
    if not isinstance(headlines, list) or not headlines:
        return '<div class="headline-row"><span class="dot dot-neu"></span><span>No headlines available.</span><span class="headline-source">N/A</span></div>'

    rows: list[str] = []
    for row in headlines[:14]:
        if not isinstance(row, dict):
            continue
        sentiment = str(row.get("sentiment") or "").strip().lower()
        dot_class = "dot-neu"
        if "pos" in sentiment:
            dot_class = "dot-pos"
        elif "neg" in sentiment:
            dot_class = "dot-neg"
        title = _safe_text(row.get("title"))
        source = _safe_text(row.get("source"))
        rows.append(
            "<div class=\"headline-row\">"
            f"<span class=\"dot {dot_class}\"></span>"
            f"<span>{escape(title)}</span>"
            f"<span class=\"headline-source\">{escape(source)}</span>"
            "</div>"
        )
    if not rows:
        return '<div class="headline-row"><span class="dot dot-neu"></span><span>No headlines available.</span><span class="headline-source">N/A</span></div>'
    return "".join(rows)


def _compute_price_change_percent(ohlcv: Any) -> float | None:
    if not isinstance(ohlcv, list) or len(ohlcv) < 2:
        return None
    last_close = None
    prev_close = None
    for row in reversed(ohlcv):
        if not isinstance(row, dict):
            continue
        value = _to_float(row.get("close"))
        if value is None:
            continue
        if last_close is None:
            last_close = value
            continue
        prev_close = value
        break
    if last_close is None or prev_close is None or prev_close == 0:
        return None
    return ((last_close - prev_close) / prev_close) * 100.0


def _format_signed_percent(value: float | None) -> str:
    if value is None:
        return "N/A"
    sign = "+" if value >= 0 else ""
    return f"{sign}{value:.2f}%"


def _score_badge_bg(value: float | None) -> str:
    if value is None:
        return "#6b7280"
    if value >= 65:
        return "#16a34a"
    if value >= 45:
        return "#d97706"
    return "#dc2626"


def _format_short_score(value: float | None) -> str:
    return "N/A" if value is None else f"{value:.1f}"


def _format_percent_share(value: float | None) -> str:
    if value is None:
        return "N/A"
    if abs(value) <= 1.0:
        return f"{value * 100.0:.1f}%"
    return f"{value:.1f}%"


def _currency_symbol(currency: str) -> str:
    code = str(currency or "").upper()
    mapping = {
        "USD": "$",
        "EUR": "EUR ",
        "GBP": "GBP ",
        "JPY": "JPY ",
        "INR": "INR ",
    }
    return mapping.get(code, f"{code} " if code else "")


def _format_currency_symbol(value: Any, currency: str) -> str:
    parsed = _to_float(value)
    if parsed is None:
        return "N/A"
    symbol = _currency_symbol(currency)
    return f"{symbol}{parsed:,.2f}"


def _format_large_number_symbol(value: Any, currency: str) -> str:
    parsed = _to_float(value)
    if parsed is None:
        return "N/A"
    symbol = _currency_symbol(currency)
    abs_value = abs(parsed)
    if abs_value >= 1_000_000_000_000:
        return f"{symbol}{parsed / 1_000_000_000_000:.2f}T"
    if abs_value >= 1_000_000_000:
        return f"{symbol}{parsed / 1_000_000_000:.2f}B"
    if abs_value >= 1_000_000:
        return f"{symbol}{parsed / 1_000_000:.2f}M"
    return f"{symbol}{parsed:,.2f}"


def _build_shareholding_donut_svg(
    institutional_share: float,
    public_share: float,
    promoter_share: float,
) -> str:
    values = [max(institutional_share, 0.0), max(public_share, 0.0), max(promoter_share, 0.0)]
    total = sum(values)
    if total <= 0:
        values = [0.0, 0.0, 1.0]
        total = 1.0
    percentages = [value / total for value in values]
    colors = ["#38bdf8", "#22c55e", "#facc15"]

    cx = 120.0
    cy = 120.0
    radius = 64.0
    stroke = 24.0
    circumference = 2.0 * 3.14159265 * radius
    offset = 0.0
    circles: list[str] = []
    for idx, fraction in enumerate(percentages):
        dash = max(0.0, min(1.0, fraction)) * circumference
        circles.append(
            f'<circle cx="{cx}" cy="{cy}" r="{radius}" fill="none" stroke="{colors[idx]}" stroke-width="{stroke}" '
            f'stroke-dasharray="{dash:.2f} {max(circumference - dash, 0.0):.2f}" stroke-dashoffset="-{offset:.2f}" '
            f'transform="rotate(-90 {cx} {cy})" />'
        )
        offset += dash

    center_text = _format_percent_share(institutional_share)
    return (
        '<svg class="score-svg" viewBox="0 0 430 220" xmlns="http://www.w3.org/2000/svg">'
        '<rect x="0" y="0" width="430" height="220" fill="transparent" />'
        f'{"".join(circles)}'
        f'<circle cx="{cx}" cy="{cy}" r="41" fill="#f3f8ff" />'
        f'<text x="{cx}" y="{cy - 4}" text-anchor="middle" font-size="18" font-weight="700" fill="#1e3a5f">{escape(center_text)}</text>'
        f'<text x="{cx}" y="{cy + 14}" text-anchor="middle" font-size="9" fill="#5f738f">Institutional</text>'
        '<rect x="230" y="74" width="14" height="14" rx="3" fill="#38bdf8" />'
        '<text x="252" y="85" font-size="13" font-weight="600" fill="#1f3b5a">Institutional</text>'
        '<rect x="230" y="106" width="14" height="14" rx="3" fill="#22c55e" />'
        '<text x="252" y="117" font-size="13" font-weight="600" fill="#1f3b5a">Retail / Public</text>'
        '<rect x="230" y="138" width="14" height="14" rx="3" fill="#facc15" />'
        '<text x="252" y="149" font-size="13" font-weight="600" fill="#1f3b5a">Promoter</text>'
        f'<text x="390" y="86" text-anchor="end" font-size="13" font-weight="700" fill="#0f172a">{escape(_format_percent_share(institutional_share))}</text>'
        f'<text x="390" y="118" text-anchor="end" font-size="13" font-weight="700" fill="#0f172a">{escape(_format_percent_share(public_share))}</text>'
        f'<text x="390" y="150" text-anchor="end" font-size="13" font-weight="700" fill="#0f172a">{escape(_format_percent_share(promoter_share))}</text>'
        "</svg>"
    )


def _build_score_gauge_svg(value: float | None) -> str:
    score = 0.0 if value is None else _clamp(value, 0.0, 100.0)
    cx = 100.0
    cy = 92.0
    radius = 68.0

    segments = [
        (180, 144, "#f97316"),
        (144, 108, "#f59e0b"),
        (108, 72, "#eab308"),
        (72, 36, "#22c55e"),
        (36, 0, "#16a34a"),
    ]
    arcs = "".join(
        f'<polyline points="{_arc_polyline_points(cx, cy, radius, start, end)}" '
        f'fill="none" stroke="{color}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" />'
        for start, end, color in segments
    )

    angle = 180.0 - (score / 100.0) * 180.0
    rad = angle * 3.14159265 / 180.0
    needle_x = cx + (radius - 20.0) * cos(rad)
    needle_y = cy - (radius - 20.0) * sin(rad)
    value_label = "N/A" if value is None else f"{score:.1f}"
    return (
        '<svg class="score-svg" viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg">'
        f"{arcs}"
        f'<line x1="{cx:.2f}" y1="{cy:.2f}" x2="{needle_x:.2f}" y2="{needle_y:.2f}" stroke="#64748b" stroke-width="5" stroke-linecap="round" />'
        f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="6" fill="#64748b" />'
        f'<text x="{cx:.2f}" y="112" text-anchor="middle" font-size="16" font-weight="700" fill="#0f172a">{escape(value_label)}</text>'
        "</svg>"
    )


def _arc_polyline_points(
    cx: float,
    cy: float,
    radius: float,
    start_deg: float,
    end_deg: float,
    steps: int = 22,
) -> str:
    if steps < 2:
        steps = 2
    points: list[str] = []
    for idx in range(steps):
        t = idx / (steps - 1)
        angle = start_deg + (end_deg - start_deg) * t
        rad = angle * 3.14159265 / 180.0
        x = cx + radius * cos(rad)
        y = cy - radius * sin(rad)
        points.append(f"{x:.2f},{y:.2f}")
    return " ".join(points)


def _build_score_chart_svg(score_items: list[tuple[str, float | None]]) -> str:
    width = 760
    row_height = 34
    chart_height = max(80, 18 + row_height * len(score_items))
    bar_x = 190
    bar_w = 480
    svg_parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{chart_height}" viewBox="0 0 {width} {chart_height}">'
    ]

    for idx, (label, value) in enumerate(score_items):
        y = 16 + idx * row_height
        pct = 50.0 if value is None else _clamp(value, 0.0, 100.0)
        fill_w = (pct / 100.0) * bar_w
        color = _score_color(value)
        value_label = "N/A" if value is None else f"{value:.1f}"

        svg_parts.append(
            f'<text x="0" y="{y + 13}" font-size="12" fill="#111827" font-weight="600">{escape(label)}</text>'
        )
        svg_parts.append(
            f'<rect x="{bar_x}" y="{y}" width="{bar_w}" height="14" rx="7" fill="#e5e7eb" />'
        )
        svg_parts.append(
            f'<rect x="{bar_x}" y="{y}" width="{fill_w:.2f}" height="14" rx="7" fill="{color}" />'
        )
        svg_parts.append(
            f'<text x="{bar_x + bar_w + 10}" y="{y + 12}" font-size="11" fill="#111827">{escape(value_label)}</text>'
        )

    svg_parts.append("</svg>")
    return "".join(svg_parts)


def _build_fundamental_chart_svg(revenue_trend: Any) -> str:
    if not isinstance(revenue_trend, list) or not revenue_trend:
        return '<div class="muted">Revenue trend data is unavailable.</div>'

    rows = revenue_trend[-5:]
    labels: list[str] = []
    revenue_vals: list[float] = []
    profit_vals: list[float] = []

    for row in rows:
        if not isinstance(row, dict):
            continue
        labels.append(str(row.get("year") or "N/A"))
        revenue_vals.append((_to_float(row.get("revenue")) or 0.0) / 1_000_000_000.0)
        profit_vals.append((_to_float(row.get("netProfit")) or 0.0) / 1_000_000_000.0)

    if not labels:
        return '<div class="muted">Revenue trend data is unavailable.</div>'

    return _build_dual_series_bar_svg(
        labels=labels,
        series_a=revenue_vals,
        series_b=profit_vals,
        series_a_name="Revenue (Bn)",
        series_b_name="Net Profit (Bn)",
        color_a="#2563eb",
        color_b="#16a34a",
    )


def _build_technical_price_chart_svg(ohlcv: Any) -> str:
    if not isinstance(ohlcv, list) or len(ohlcv) < 2:
        return '<div class="muted">Price history is unavailable.</div>'

    tail = ohlcv[-120:]
    closes: list[float] = []
    start_label = "N/A"
    end_label = "N/A"
    for idx, row in enumerate(tail):
        if not isinstance(row, dict):
            continue
        close_value = _to_float(row.get("close"))
        if close_value is None:
            continue
        closes.append(close_value)
        if idx == 0:
            start_label = _format_date(row.get("date"))
        end_label = _format_date(row.get("date"))

    if len(closes) < 2:
        return '<div class="muted">Price history is unavailable.</div>'

    return _build_line_svg(
        values=closes,
        start_label=start_label,
        end_label=end_label,
        line_color="#2563eb",
    )


def _build_sentiment_chart_svg(counts: dict[str, int]) -> str:
    labels = ["Positive", "Neutral", "Negative"]
    values = [counts["positive"], counts["neutral"], counts["negative"]]
    colors = ["#16a34a", "#f59e0b", "#dc2626"]

    total = sum(values)
    if total <= 0:
        return '<div class="muted">Headline sentiment distribution is unavailable.</div>'

    width = 760
    height = 220
    margin_top = 26
    margin_bottom = 36
    margin_left = 50
    plot_height = height - margin_top - margin_bottom
    max_val = max(values) if values else 1
    bar_w = 110
    gap = 95
    x_start = 110

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">'
    ]
    parts.append(
        f'<line x1="{margin_left}" y1="{height - margin_bottom}" x2="{width - 26}" y2="{height - margin_bottom}" stroke="#9ca3af" stroke-width="1" />'
    )

    for idx, label in enumerate(labels):
        value = values[idx]
        color = colors[idx]
        x = x_start + idx * (bar_w + gap)
        h = 0 if max_val <= 0 else (value / max_val) * plot_height
        y = height - margin_bottom - h
        pct = (value / total) * 100 if total else 0
        parts.append(
            f'<rect x="{x}" y="{y:.2f}" width="{bar_w}" height="{h:.2f}" fill="{color}" rx="8" />'
        )
        parts.append(
            f'<text x="{x + bar_w / 2:.1f}" y="{y - 6:.2f}" text-anchor="middle" font-size="11" fill="#111827">{value}</text>'
        )
        parts.append(
            f'<text x="{x + bar_w / 2:.1f}" y="{height - 16}" text-anchor="middle" font-size="11" fill="#111827">{escape(label)} ({pct:.1f}%)</text>'
        )

    parts.append("</svg>")
    return "".join(parts)


def _build_dual_series_bar_svg(
    labels: list[str],
    series_a: list[float],
    series_b: list[float],
    series_a_name: str,
    series_b_name: str,
    color_a: str,
    color_b: str,
) -> str:
    width = 760
    height = 240
    margin_top = 34
    margin_bottom = 40
    margin_left = 56
    margin_right = 16
    plot_h = height - margin_top - margin_bottom
    plot_w = width - margin_left - margin_right

    vals = [*series_a, *series_b]
    min_val = min(min(vals), 0.0) if vals else 0.0
    max_val = max(max(vals), 0.0) if vals else 1.0
    if max_val == min_val:
        max_val = min_val + 1.0

    def y_for(value: float) -> float:
        return margin_top + (max_val - value) / (max_val - min_val) * plot_h

    zero_y = y_for(0.0)
    count = max(1, len(labels))
    slot_w = plot_w / count
    bar_w = min(26.0, slot_w * 0.28)
    gap = bar_w * 0.35

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">'
    ]
    parts.append(
        f'<line x1="{margin_left}" y1="{zero_y:.2f}" x2="{width - margin_right}" y2="{zero_y:.2f}" stroke="#94a3b8" stroke-width="1.2" />'
    )
    parts.append(
        f'<text x="{margin_left}" y="16" font-size="11" fill="#334155">{escape(series_a_name)}</text>'
    )
    parts.append(
        f'<rect x="{margin_left + 105}" y="8" width="14" height="8" fill="{color_a}" rx="2" />'
    )
    parts.append(
        f'<text x="{margin_left + 125}" y="16" font-size="11" fill="#334155">{escape(series_b_name)}</text>'
    )
    parts.append(
        f'<rect x="{margin_left + 220}" y="8" width="14" height="8" fill="{color_b}" rx="2" />'
    )

    for idx, label in enumerate(labels):
        center_x = margin_left + slot_w * idx + slot_w / 2

        for value, color, shift in (
            (series_a[idx], color_a, -(bar_w / 2 + gap / 2)),
            (series_b[idx], color_b, +(bar_w / 2 + gap / 2)),
        ):
            bar_x = center_x + shift - bar_w / 2
            bar_y = y_for(value) if value >= 0 else zero_y
            bar_h = abs(y_for(value) - zero_y)
            parts.append(
                f'<rect x="{bar_x:.2f}" y="{bar_y:.2f}" width="{bar_w:.2f}" height="{bar_h:.2f}" fill="{color}" rx="3" />'
            )

        parts.append(
            f'<text x="{center_x:.2f}" y="{height - 14}" text-anchor="middle" font-size="10.5" fill="#334155">{escape(label)}</text>'
        )

    parts.append("</svg>")
    return "".join(parts)


def _build_line_svg(
    values: list[float],
    start_label: str,
    end_label: str,
    line_color: str,
) -> str:
    width = 760
    height = 230
    margin_top = 24
    margin_bottom = 38
    margin_left = 52
    margin_right = 16
    plot_h = height - margin_top - margin_bottom
    plot_w = width - margin_left - margin_right

    vmin = min(values)
    vmax = max(values)
    if vmax == vmin:
        vmax = vmin + 1.0

    points: list[str] = []
    for idx, value in enumerate(values):
        x = margin_left + (idx / (len(values) - 1)) * plot_w
        y = margin_top + (vmax - value) / (vmax - vmin) * plot_h
        points.append(f"{x:.2f},{y:.2f}")

    polyline = " ".join(points)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">'
        f'<rect x="{margin_left}" y="{margin_top}" width="{plot_w}" height="{plot_h}" fill="#ffffff" stroke="#e5e7eb" />'
        f'<polyline fill="none" stroke="{line_color}" stroke-width="2.2" points="{polyline}" />'
        f'<text x="{margin_left}" y="14" font-size="11" fill="#111827">Max: {escape(_format_number(vmax))}</text>'
        f'<text x="{margin_left}" y="{height - 8}" font-size="11" fill="#111827">Min: {escape(_format_number(vmin))}</text>'
        f'<text x="{margin_left}" y="{height - 20}" font-size="10" fill="#6b7280">{escape(start_label)}</text>'
        f'<text x="{width - margin_right}" y="{height - 20}" text-anchor="end" font-size="10" fill="#6b7280">{escape(end_label)}</text>'
        "</svg>"
    )


def _build_sentiment_counts(headlines: Any) -> dict[str, int]:
    counts = {"positive": 0, "neutral": 0, "negative": 0}
    if not isinstance(headlines, list):
        return counts

    for row in headlines:
        if not isinstance(row, dict):
            continue
        label = str(row.get("sentiment") or "").strip().lower()
        if "pos" in label:
            counts["positive"] += 1
        elif "neg" in label:
            counts["negative"] += 1
        else:
            counts["neutral"] += 1
    return counts


def _build_headline_rows(headlines: Any) -> str:
    if not isinstance(headlines, list) or not headlines:
        return '<tr><td colspan="5" class="muted">No headlines available.</td></tr>'

    rows: list[str] = []
    for row in headlines[:10]:
        if not isinstance(row, dict):
            continue
        date_text = _format_date(row.get("publishedAt") or row.get("published_at") or row.get("pubDate"))
        source = _safe_text(row.get("source"))
        sentiment = _safe_text(row.get("sentiment"))
        score = _format_number(row.get("sentimentScore"), decimals=3)
        title = _safe_text(row.get("title"))
        rows.append(
            "<tr>"
            f"<td>{escape(date_text)}</td>"
            f"<td>{escape(source)}</td>"
            f"<td>{escape(sentiment)}</td>"
            f"<td>{escape(score)}</td>"
            f"<td>{escape(title)}</td>"
            "</tr>"
        )
    if not rows:
        return '<tr><td colspan="5" class="muted">No headlines available.</td></tr>'
    return "".join(rows)


def _build_two_column_rows(rows: list[tuple[str, str]]) -> str:
    html_rows: list[str] = []
    for idx in range(0, len(rows), 2):
        left = rows[idx]
        right = rows[idx + 1] if idx + 1 < len(rows) else ("", "")
        html_rows.append(
            "<tr>"
            f"<td>{escape(left[0])}</td><td>{escape(left[1])}</td>"
            f"<td>{escape(right[0])}</td><td>{escape(right[1])}</td>"
            "</tr>"
        )
    return "".join(html_rows)


def _build_single_column_rows(rows: list[tuple[str, str]]) -> str:
    return "".join(
        f"<tr><td>{escape(label)}</td><td>{escape(value)}</td></tr>"
        for label, value in rows
    )


def _build_bullet_items(items: list[str]) -> str:
    if not items:
        return '<li class="muted">No additional commentary available.</li>'
    return "".join(f"<li>{escape(item)}</li>" for item in items)


def _extract_bullets(text: Any, default_text: str, max_items: int) -> list[str]:
    raw = _strip_markdown(str(text or "")).strip()
    if not raw:
        return [default_text]

    lines = [line.strip() for line in raw.splitlines() if line.strip()]
    marker_pattern = re.compile(r"^(?:[-*•]\s+|\d+[.)]\s+)")
    bullets: list[str] = []
    has_explicit_markers = False

    for line in lines:
        if marker_pattern.match(line):
            has_explicit_markers = True
        candidate = re.sub(r"^(?:[-*•]\s+|\d+[.)]\s+)+", "", line).strip(" -")
        if candidate:
            bullets.append(candidate)

    if has_explicit_markers:
        return bullets[:max_items]

    if len(bullets) > 1:
        return bullets[:max_items]

    narrative = bullets[0] if bullets else raw
    bullets = [
        part.strip(" -")
        for part in re.split(r"(?<=[.!?])\s+|;\s+", narrative)
        if part.strip()
    ]
    if len(bullets) <= 1:
        bullets = [
            part.strip()
            for part in re.split(r"\s+-\s+", narrative)
            if part.strip()
        ]
    if not bullets:
        return [default_text]
    return bullets[:max_items]


def _extract_summary_text(text: Any, default: str) -> str:
    raw = _strip_markdown(str(text or "")).strip()
    if not raw:
        return default
    raw = re.sub(r"\s+", " ", raw).strip()
    return raw[:500]


def _strip_markdown(text: str) -> str:
    text = re.sub(r"`([^`]*)`", r"\1", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"__([^_]+)__", r"\1", text)
    text = re.sub(r"#+\s*", "", text)
    return text


def _safe_list_numbers(value: Any) -> list[float]:
    if not isinstance(value, list):
        return []
    out: list[float] = []
    for item in value:
        parsed = _to_float(item)
        if parsed is not None:
            out.append(parsed)
    return out


def _normalize_currency(value: Any) -> str:
    text = str(value or "").strip().upper()
    return text if text else "USD"


def _to_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        parsed = float(value)
        if parsed != parsed:  # NaN
            return None
        return parsed
    except (TypeError, ValueError):
        return None


def _to_int(value: Any) -> int | None:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _format_int(value: Any) -> str:
    parsed = _to_int(value)
    return "N/A" if parsed is None else f"{parsed:,}"


def _format_score(value: Any) -> str:
    parsed = _to_float(value)
    return "N/A" if parsed is None else f"{parsed:.1f} / 100"


def _format_number(value: Any, decimals: int = 2) -> str:
    parsed = _to_float(value)
    if parsed is None:
        return "N/A"
    fmt = f"{{:,.{decimals}f}}"
    return fmt.format(parsed)


def _format_currency(value: Any, currency: str) -> str:
    parsed = _to_float(value)
    if parsed is None:
        return "N/A"
    return f"{currency} {parsed:,.2f}"


def _format_percent(value: Any) -> str:
    parsed = _to_float(value)
    if parsed is None:
        return "N/A"
    percent = parsed * 100.0 if abs(parsed) <= 1.5 else parsed
    return f"{percent:.2f}%"


def _format_large_number(value: Any, currency: str) -> str:
    parsed = _to_float(value)
    if parsed is None:
        return "N/A"
    abs_value = abs(parsed)
    if abs_value >= 1_000_000_000_000:
        return f"{currency} {parsed / 1_000_000_000_000:.2f}T"
    if abs_value >= 1_000_000_000:
        return f"{currency} {parsed / 1_000_000_000:.2f}B"
    if abs_value >= 1_000_000:
        return f"{currency} {parsed / 1_000_000:.2f}M"
    return f"{currency} {parsed:,.2f}"


def _format_bool(value: Any) -> str:
    if value is True:
        return "Yes"
    if value is False:
        return "No"
    return "N/A"


def _safe_text(value: Any) -> str:
    text = str(value or "").strip()
    return text if text else "N/A"


def _format_date(value: Any) -> str:
    if value is None:
        return "N/A"
    raw = str(value).strip()
    if not raw:
        return "N/A"
    try:
        normalized = raw.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        return parsed.strftime("%Y-%m-%d")
    except ValueError:
        pass
    return raw[:10]


def _score_color(value: float | None) -> str:
    if value is None:
        return "#6b7280"
    if value >= 65:
        return "#16a34a"
    if value >= 45:
        return "#f59e0b"
    return "#dc2626"


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))
