import { useEffect, useMemo, useState } from 'react'

import { fetchMultipleAnalyses, fetchUsdFxRates } from '../api'
import type { AnalysisResponse } from '../types'
import { StockSearchForm } from './StockSearchForm'

type ComparisonEngineProps = {
  tickers: string[]
  onCompare: (tickers: string[]) => void
  onOpenAnalysis: (ticker: string) => void
}

type ComparisonCompany = {
  analysis: AnalysisResponse
  ticker: string
  companyName: string
  price: number | null
  currency: string
  usdRate: number | null
  usdPrice: number | null
  usdMarketCap: number | null
  marketCap: number | null | undefined
  overallScore: number
  verdict: string
}

type ComparisonMetricRow = {
  label: string
  values: string[]
  highlightedIndexes?: number[]
}

type ComparisonMetricSection = {
  title: string
  rows: ComparisonMetricRow[]
}

const MIN_COMPANY_SLOTS = 2
const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
})
const decimalFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
})
const percentFormatter = new Intl.NumberFormat('en-US', {
  style: 'percent',
  maximumFractionDigits: 2,
})
const usdCurrencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

export function ComparisonEngine({
  tickers,
  onCompare,
  onOpenAnalysis,
}: ComparisonEngineProps) {
  const [draftTickers, setDraftTickers] = useState<string[]>(() => normalizeDraftTickers(tickers))
  const [analyses, setAnalyses] = useState<AnalysisResponse[]>([])
  const [usdRates, setUsdRates] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [formError, setFormError] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    setDraftTickers(normalizeDraftTickers(tickers))
    setFormError('')
  }, [tickers])

  const activeTickers = useMemo(
    () => Array.from(new Set(tickers.map((ticker) => normalizeTicker(ticker)).filter(Boolean))),
    [tickers],
  )
  const hasEnoughCompanies = activeTickers.length >= 2

  useEffect(() => {
    if (!hasEnoughCompanies) {
      setAnalyses([])
      setIsLoading(false)
      setError('')
      return
    }

    let cancelled = false
    setIsLoading(true)
    setError('')

    fetchMultipleAnalyses(activeTickers)
      .then(async (payload) => {
        const currencies = payload.map((analysis) => resolveCurrency(analysis))
        const rates = await fetchUsdFxRates(currencies)
        if (!cancelled) {
          setAnalyses(payload)
          setUsdRates(rates)
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          const message =
            requestError instanceof Error
              ? requestError.message
              : 'Unable to compare these stocks right now.'
          setAnalyses([])
          setUsdRates({})
          setError(message)
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [activeTickers, hasEnoughCompanies, retryKey])

  const companies = useMemo<ComparisonCompany[]>(() => {
    return analyses.map((analysis, index) => {
      const fallbackTicker = activeTickers[index] ?? analysis.ticker
      const ticker = normalizeTicker(analysis.ticker || fallbackTicker)
      const price =
        analysis.fundamental?.data?.currentPrice ??
        analysis.technical?.data?.lastClose ??
        analysis.technical?.indicators?.close ??
        null
      const currency = resolveCurrency(analysis)
      const usdRate = usdRates[currency] ?? (currency === 'USD' ? 1 : null)

      return {
        analysis,
        ticker,
        companyName: resolveCompanyName(analysis),
        price,
        currency,
        usdRate,
        usdPrice: convertToUsd(price, usdRate),
        usdMarketCap: convertToUsd(analysis.fundamental?.data?.marketCap, usdRate),
        marketCap: analysis.fundamental?.data?.marketCap,
        overallScore: analysis.overview.overallScore,
        verdict: analysis.overview.verdict || 'N/A',
      }
    })
  }, [activeTickers, analyses, usdRates])

  const ranking = useMemo(() => {
    return [...companies].sort((left, right) => right.overallScore - left.overallScore)
  }, [companies])

  const topCompany = ranking[0] ?? null

  const metricSections = useMemo<ComparisonMetricSection[]>(() => {
    if (companies.length === 0) {
      return []
    }

    return [
      {
        title: 'Scoreboard',
        rows: [
          buildNumericRow(
            'Overall score',
            companies.map((company) => company.analysis.overview.overallScore),
            formatScore,
          ),
          buildNumericRow(
            'Fundamental score',
            companies.map((company) => company.analysis.overview.fundamentalScore),
            formatScore,
          ),
          buildNumericRow(
            'Technical score',
            companies.map((company) => company.analysis.overview.technicalScore),
            formatScore,
          ),
          buildNumericRow(
            'Sentiment score',
            companies.map((company) => company.analysis.overview.sentimentScore),
            formatScore,
          ),
        ],
      },
      {
        title: 'Market Snapshot',
        rows: [
          {
            label: 'Current price (USD)',
            values: companies.map((company) => formatUsd(company.usdPrice)),
            highlightedIndexes: findBestIndexes(
              companies.map((company) => company.usdPrice),
              'higher',
            ),
          },
          buildNumericRow(
            'Market cap (USD)',
            companies.map((company) => company.usdMarketCap),
            formatUsdCompact,
          ),
          {
            label: 'Sector',
            values: companies.map(
              (company) => company.analysis.fundamental?.data?.sector?.trim() || 'N/A',
            ),
          },
          {
            label: 'Industry',
            values: companies.map(
              (company) => company.analysis.fundamental?.data?.industry?.trim() || 'N/A',
            ),
          },
        ],
      },
      {
        title: 'Fundamental Read',
        rows: [
          buildNumericRow(
            'Revenue growth',
            companies.map((company) => company.analysis.fundamental?.data?.revenueGrowth),
            formatPercent,
          ),
          buildNumericRow(
            'Earnings growth',
            companies.map((company) => company.analysis.fundamental?.data?.earningsGrowth),
            formatPercent,
          ),
          buildNumericRow(
            'Relative standing (Trailing P/E)',
            companies.map(
              (company) => company.analysis.fundamental?.data?.sectorPeersAnalysis?.trailing?.relativeStandingScore,
            ),
            (val) =>
              formatRelativeStanding(
                val,
                companies.find(
                  (c) =>
                    c.analysis.fundamental?.data?.sectorPeersAnalysis?.trailing?.relativeStandingScore === val,
                )?.analysis.fundamental?.data?.sectorPeersAnalysis?.trailing?.relativeStandingLabel,
              ),
            'lower',
          ),
          buildNumericRow(
            'Relative standing (Forward P/E)',
            companies.map(
              (company) => company.analysis.fundamental?.data?.sectorPeersAnalysis?.forward?.relativeStandingScore,
            ),
            (val) =>
              formatRelativeStanding(
                val,
                companies.find(
                  (c) =>
                    c.analysis.fundamental?.data?.sectorPeersAnalysis?.forward?.relativeStandingScore === val,
                )?.analysis.fundamental?.data?.sectorPeersAnalysis?.forward?.relativeStandingLabel,
              ),
            'lower',
          ),
          buildNumericRow(
            'Return on equity',
            companies.map((company) => company.analysis.fundamental?.data?.returnOnEquity),
            formatPercent,
          ),
          buildNumericRow(
            'Debt to equity',
            companies.map((company) => company.analysis.fundamental?.data?.debtToEquity),
            formatDecimal,
            'lower',
          ),
        ],
      },
      {
        title: 'Signal Read',
        rows: [
          {
            label: 'Technical signal',
            values: companies.map(
              (company) =>
                company.analysis.technical?.signal?.trim() ||
                company.analysis.technical?.trend?.trim() ||
                'N/A',
            ),
          },
          buildNumericRow(
            'RSI',
            companies.map(
              (company) =>
                company.analysis.technical?.data?.rsi ??
                company.analysis.technical?.indicators?.RSI,
            ),
            formatDecimal,
          ),
          buildNumericRow(
            'News headlines',
            companies.map((company) => company.analysis.sentiment?.data?.count),
            formatInteger,
          ),
          {
            label: 'Verdict',
            values: companies.map((company) => company.verdict),
          },
        ],
      },
    ]
  }, [companies])

  const handleSetTicker = (index: number, ticker: string) => {
    setDraftTickers((current) => {
      const next = [...current]
      next[index] = normalizeTicker(ticker)
      return next
    })
    setFormError('')
  }

  const handleAddCompany = () => {
    setDraftTickers((current) => [...current, ''])
    setFormError('')
  }

  const handleRemoveCompany = (index: number) => {
    setDraftTickers((current) => {
      if (current.length <= MIN_COMPANY_SLOTS) {
        return current
      }
      return current.filter((_, currentIndex) => currentIndex !== index)
    })
    setFormError('')
  }

  const handleRunComparison = () => {
    const nextTickers = Array.from(
      new Set(draftTickers.map((ticker) => normalizeTicker(ticker)).filter(Boolean)),
    )

    if (nextTickers.length < 2) {
      setFormError('Pick at least two different stocks before running the comparison.')
      return
    }

    setFormError('')
    onCompare(nextTickers)
  }

  return (
    <section className="analysis-layout comparison-layout">
      <div className="analysis-header reveal">
        <div className="analysis-header-copy">
          <p className="kicker">Feature Workspace</p>
          <h1>Stock Comparison Engine</h1>
          <p className="comparison-intro-copy">
            Compare multiple stocks side by side using the same backend analysis
            pipeline that powers the main stock analysis experience.
          </p>
        </div>
      </div>

      <section className="comparison-controls panel reveal">
        <div className="comparison-toolbar">
          <div>
            <p className="kicker">Comparison Setup</p>
            <h2>Build a multi-company watchlist</h2>
          </div>
          <button type="button" className="secondary" onClick={handleAddCompany}>
            Add Company
          </button>
        </div>

        <div className="comparison-picker-grid">
          {draftTickers.map((ticker, index) => (
            <div key={`comparison-slot-${index}`} className="comparison-form-card">
              <div className="comparison-form-head">
                <div>
                  <p className="kicker">Company {index + 1}</p>
                  <h2>{normalizeTicker(ticker) || 'Select a ticker'}</h2>
                </div>
                <button
                  type="button"
                  className="comparison-remove-button"
                  onClick={() => handleRemoveCompany(index)}
                  disabled={draftTickers.length <= MIN_COMPANY_SLOTS}
                  aria-label={`Remove company slot ${index + 1}`}
                >
                  Remove
                </button>
              </div>

              <StockSearchForm
                ariaLabel={`Choose company ${index + 1}`}
                className="comparison-search"
                initialValue={ticker}
                onValueChange={(nextTicker) => handleSetTicker(index, nextTicker)}
                onSearch={(nextTicker) => handleSetTicker(index, nextTicker)}
                placeholder="Search company or ticker"
                showButton={false}
              />
            </div>
          ))}
        </div>

        <div className="comparison-action-row">
          <button type="button" onClick={handleRunComparison}>
            Run Comparison
          </button>
        </div>

        {formError && <p className="comparison-feedback">{formError}</p>}
      </section>

      {!hasEnoughCompanies && (
        <section className="panel comparison-empty-state reveal">
          <p className="kicker">How It Works</p>
          <h2>Compare more than two companies in one workspace</h2>
          <p>
            Add at least two companies, run the comparison, and review shared score,
            valuation, and signal metrics across the whole group.
          </p>
        </section>
      )}

      {isLoading && (
        <div className="panel comparison-status-card reveal">
          <p className="kicker">Loading</p>
          <h2>Running multi-company analysis</h2>
          <p>Fetching the latest comparison data for {activeTickers.join(', ')}.</p>
        </div>
      )}

      {!isLoading && error && (
        <div className="error-card reveal">
          <h2>Comparison unavailable</h2>
          <p>{error}</p>
          <button type="button" onClick={() => setRetryKey((value) => value + 1)}>
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && companies.length > 0 && (
        <>
          {topCompany && (
            <section className="comparison-lead-banner reveal winner-left">
              <p className="kicker">Comparison Signal</p>
              <h2>{topCompany.companyName} leads this comparison set</h2>
              <p>
                {topCompany.ticker} currently has the highest composite score across the
                selected companies when fundamental, technical, and sentiment signals are combined.
              </p>
            </section>
          )}

          <div className="comparison-summary-grid reveal comparison-summary-grid-multi">
            {ranking.map((company, index) => (
              <ComparisonStockCard
                key={company.ticker}
                company={company}
                rank={index + 1}
                isLeader={index === 0}
                onOpenAnalysis={onOpenAnalysis}
              />
            ))}
          </div>

          <div className="comparison-metrics-grid reveal comparison-metrics-grid-single">
            {metricSections.map((section) => (
              <ComparisonMetricTable
                key={section.title}
                companies={companies}
                section={section}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function ComparisonStockCard({
  company,
  rank,
  isLeader,
  onOpenAnalysis,
}: {
  company: ComparisonCompany
  rank: number
  isLeader: boolean
  onOpenAnalysis: (ticker: string) => void
}) {
  return (
    <article className={`comparison-stock-card ${isLeader ? 'emphasis-leading' : 'emphasis-neutral'}`}>
      <div className="comparison-stock-head">
        <p className="kicker">Rank #{rank}</p>
        <h2>{company.companyName}</h2>
        <p>{company.ticker}</p>
      </div>

      <dl className="comparison-stock-metrics">
        <div>
          <dt>Overall Score</dt>
          <dd>{formatScore(company.overallScore)}</dd>
        </div>
        <div>
          <dt>Current Price (USD)</dt>
          <dd>{formatUsd(company.usdPrice)}</dd>
        </div>
        <div>
          <dt>Market Cap (USD)</dt>
          <dd>{formatUsdCompact(company.usdMarketCap)}</dd>
        </div>
      </dl>

      <p className="comparison-card-verdict">{company.verdict}</p>

      <button type="button" className="secondary" onClick={() => onOpenAnalysis(company.ticker)}>
        Open Full Analysis
      </button>
    </article>
  )
}

function ComparisonMetricTable({
  companies,
  section,
}: {
  companies: ComparisonCompany[]
  section: ComparisonMetricSection
}) {
  return (
    <section className="comparison-section panel">
      <div className="comparison-section-header">
        <p className="kicker">Comparison Table</p>
        <h2>{section.title}</h2>
      </div>

      <div className="comparison-table-scroll">
        <table className="comparison-data-table">
          <thead>
            <tr>
              <th>Metric</th>
              {companies.map((company) => (
                <th key={`${section.title}-${company.ticker}`}>
                  <span className="comparison-table-company">{company.companyName}</span>
                  <span className="comparison-table-ticker">{company.ticker}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {section.rows.map((row) => (
              <tr key={`${section.title}-${row.label}`}>
                <th>{row.label}</th>
                {row.values.map((value, index) => (
                  <td
                    key={`${row.label}-${companies[index]?.ticker ?? index}`}
                    className={
                      row.highlightedIndexes?.includes(index) ? 'is-winner' : undefined
                    }
                  >
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function buildNumericRow(
  label: string,
  values: Array<number | null | undefined>,
  formatter: (value: number | null | undefined) => string,
  preference: 'higher' | 'lower' = 'higher',
): ComparisonMetricRow {
  return {
    label,
    values: values.map((value) => formatter(value)),
    highlightedIndexes: findBestIndexes(values, preference),
  }
}

function findBestIndexes(
  values: Array<number | null | undefined>,
  preference: 'higher' | 'lower',
): number[] {
  const numericEntries = values
    .map((value, index) => ({ value, index }))
    .filter((entry): entry is { value: number; index: number } => isFiniteNumber(entry.value))

  if (numericEntries.length < 2) {
    return []
  }

  const targetValue =
    preference === 'lower'
      ? Math.min(...numericEntries.map((entry) => entry.value))
      : Math.max(...numericEntries.map((entry) => entry.value))

  return numericEntries
    .filter((entry) => Math.abs(entry.value - targetValue) < 0.0001)
    .map((entry) => entry.index)
}

function normalizeDraftTickers(tickers: string[]): string[] {
  const normalized = tickers.map((ticker) => normalizeTicker(ticker)).filter(Boolean)
  if (normalized.length >= MIN_COMPANY_SLOTS) {
    return normalized
  }
  return [...normalized, ...Array.from({ length: MIN_COMPANY_SLOTS - normalized.length }, () => '')]
}

function resolveCompanyName(analysis: AnalysisResponse): string {
  return (
    analysis.fundamental?.data?.shortName?.trim() ||
    analysis.fundamental?.data?.longName?.trim() ||
    analysis.ticker
  )
}

function resolveCurrency(analysis: AnalysisResponse): string {
  return (
    analysis.fundamental?.data?.currency?.trim() ||
    analysis.technical?.data?.currency?.trim() ||
    analysis.technical?.currency?.trim() ||
    'USD'
  )
}

function convertToUsd(
  value: number | null | undefined,
  usdRate: number | null | undefined,
): number | null {
  if (!isFiniteNumber(value)) {
    return null
  }
  if (!isFiniteNumber(usdRate) || usdRate <= 0) {
    return null
  }
  return value * usdRate
}

function formatUsd(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) {
    return 'N/A'
  }
  return usdCurrencyFormatter.format(value)
}

function formatUsdCompact(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) {
    return 'N/A'
  }
  return `$${compactFormatter.format(value)}`
}

function formatDecimal(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) {
    return 'N/A'
  }
  return decimalFormatter.format(value)
}

function formatInteger(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) {
    return 'N/A'
  }
  return Math.round(value).toString()
}

function formatRelativeStanding(value: number | null | undefined, label: string | null | undefined): string {
  if (!isFiniteNumber(value)) {
    return 'N/A'
  }
  return `${value > 0 ? '+' : ''}${value.toFixed(2)} (${label || 'N/A'})`
}

function formatPercent(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) {
    return 'N/A'
  }
  return percentFormatter.format(value)
}

function formatScore(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) {
    return 'N/A'
  }
  return value.toFixed(1)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizeTicker(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, '')
}
