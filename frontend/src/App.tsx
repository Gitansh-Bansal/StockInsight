import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { ReactElement } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  AreaChart, Area,
  PieChart, Pie, Cell
} from 'recharts'
import './App.css'
import { fetchAnalysis } from './api'
import type {
  AnalysisResponse,
  FundamentalData,
  OhlcvPoint,
  ReportSections,
  SentimentHeadline,
  TechnicalData,
  TechnicalResult,
} from './types'

const PERIOD_OPTIONS = [
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
  { label: '6M', value: '6mo' },
  { label: '1Y', value: '1y' },
  { label: '2Y', value: '2y' },
  { label: '5Y', value: '5y' },
]

type AnalysisTab =
  | 'overview'
  | 'fundamental'
  | 'technical'
  | 'sentiment'
  | 'full-report'

const ANALYSIS_TABS: Array<{ key: AnalysisTab; label: string }> = [
  { key: 'overview', label: 'Overall' },
  { key: 'fundamental', label: 'Fundamental' },
  { key: 'technical', label: 'Technical' },
  { key: 'sentiment', label: 'Sentiment' },
  { key: 'full-report', label: 'Full Report' },
]

type AppRoute =
  | { type: 'home' }
  | { type: 'stock'; ticker: string; tab: AnalysisTab }

const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
})

const decimalFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
})

const usdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
})

function App() {
  const { pathname, search, navigate } = usePathRouter()
  const route = useMemo(() => parseRoute(pathname), [pathname])
  const initialPeriod = useMemo(() => parsePeriodFromSearch(search), [search])
  const activeTicker = route.type === 'stock' ? route.ticker : null

  const handleSearch = useCallback(
    (input: string, period: string) => {
      const ticker = normalizeTicker(input)
      if (!ticker) {
        return
      }
      const chosenPeriod = normalizePeriod(period)
      navigate(
        `/stock/${encodeURIComponent(ticker)}/overview?period=${encodeURIComponent(chosenPeriod)}`,
      )
    },
    [navigate],
  )

  const goHome = useCallback(() => {
    navigate('/')
  }, [navigate])

  return (
    <div className="app-shell">
      <HeaderBar
        key={`${activeTicker ?? 'home'}-${initialPeriod}`}
        initialSearch={activeTicker ?? ''}
        initialPeriod={initialPeriod}
        isHome={route.type === 'home'}
        onSearch={handleSearch}
        onHome={goHome}
      />

      <main className="content">
        {route.type === 'stock' ? (
          <AnalysisPage
            key={`${route.ticker}-${initialPeriod}`}
            ticker={route.ticker}
            initialPeriod={initialPeriod}
            tab={route.tab}
            onTabChange={(tab) =>
              navigate(
                `/stock/${encodeURIComponent(route.ticker)}/${tab}?period=${encodeURIComponent(initialPeriod)}`,
              )
            }
          />
        ) : (
          <HomePage onSearch={handleSearch} />
        )}
      </main>
    </div>
  )
}

type HeaderBarProps = {
  initialSearch: string
  initialPeriod: string
  isHome: boolean
  onSearch: (ticker: string, period: string) => void
  onHome: () => void
}

function HeaderBar({
  initialSearch,
  initialPeriod,
  isHome,
  onSearch,
  onHome,
}: HeaderBarProps) {
  const [searchValue, setSearchValue] = useState(initialSearch)
  const [periodValue, setPeriodValue] = useState(initialPeriod)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSearch(searchValue, periodValue)
  }

  return (
    <header className="top-bar">
      <button className="brand" type="button" onClick={onHome}>
        StockInsight
      </button>
      {isHome ? (
        <div className="top-actions">
          <button type="button">Log In</button>
          <button type="button" className="secondary">
            Create Account
          </button>
        </div>
      ) : (
        <form className="top-search" onSubmit={handleSubmit}>
          <div className="search-field">
            <input
              value={searchValue}
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Search ticker (AAPL, MSFT, NVDA)"
              aria-label="Search ticker symbol"
            />
            <select
              value={periodValue}
              onChange={(event) => setPeriodValue(event.target.value)}
              aria-label="Select duration"
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit">Search</button>
        </form>
      )}
    </header>
  )
}

type HomePageProps = {
  onSearch: (ticker: string, period: string) => void
}

function HomePage({ onSearch }: HomePageProps) {
  const [tickerInput, setTickerInput] = useState('')
  const [periodValue, setPeriodValue] = useState('1y')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSearch(tickerInput, periodValue)
  }

  return (
    <section className="hero">
      <div className="hero-single">
        <p className="kicker">Live equity intelligence workspace</p>
        <h1>One screen to inspect how a stock scores across core signals.</h1>
        <p>
          Search any ticker to open structured analysis sections for overall,
          fundamental, technical, and sentiment views.
        </p>
        <h2>Start With A Ticker</h2>
        <form className="hero-search" onSubmit={handleSubmit}>
          <div className="search-field">
            <input
              value={tickerInput}
              onChange={(event) => setTickerInput(event.target.value)}
              placeholder="Enter ticker"
              aria-label="Ticker symbol input"
            />
            <select
              value={periodValue}
              onChange={(event) => setPeriodValue(event.target.value)}
              aria-label="Select duration"
            >
              {PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit">Open Analysis</button>
        </form>
        <p>Examples: AAPL, TSLA, AMZN, JPM, META.</p>
      </div>
    </section>
  )
}

type AnalysisPageProps = {
  ticker: string
  initialPeriod: string
  tab: AnalysisTab
  onTabChange: (tab: AnalysisTab) => void
}

function AnalysisPage({ ticker, initialPeriod, tab, onTabChange }: AnalysisPageProps) {
  const [period, setPeriod] = useState(initialPeriod)
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    fetchAnalysis(ticker, period)
      .then((payload) => {
        if (!cancelled) {
          setAnalysis(payload)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'Unable to fetch analysis.'
          setError(message)
          setAnalysis(null)
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
  }, [period, retryKey, ticker])

  const companyName = useMemo(() => {
    const data = analysis?.fundamental?.data
    if (!data) {
      return ''
    }
    return data.shortName ?? data.longName ?? ''
  }, [analysis])

  return (
    <section className="analysis-layout">
      <div className="analysis-header reveal">
        <div>
          <p className="kicker">Ticker Detail</p>
          <h1>{companyName ? `${companyName} (${ticker})` : ticker}</h1>
        </div>
        <label className="period-control">
          <span>Period</span>
          <select
            value={period}
            onChange={(event) => {
              setIsLoading(true)
              setError('')
              setPeriod(event.target.value)
            }}
            aria-label="Select analysis period"
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <nav className="analysis-tabs reveal" aria-label="Analysis sections">
        {ANALYSIS_TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={item.key === tab ? 'active' : ''}
            onClick={() => onTabChange(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {isLoading && <LoadingPanel tab={tab} />}

      {!isLoading && error && (
        <div className="error-card reveal">
          <h2>Analysis unavailable</h2>
          <p>{error}</p>
          <button
            type="button"
            onClick={() => {
              setIsLoading(true)
              setError('')
              setRetryKey((value) => value + 1)
            }}
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !error && analysis && renderSection(tab, analysis, period, ticker)}
    </section>
  )
}

type OverviewSectionProps = {
  overview: AnalysisResponse['overview']
  llmSummary?: string
}

function OverviewSection({ overview, llmSummary }: OverviewSectionProps) {
  const summary =
    llmSummary?.trim() ||
    'Composite score blends fundamental, technical, and sentiment signals into one decision-oriented output.'

  return (
    <article className="panel reveal">
      <header className="panel-head">
        <h2>Overall Analysis</h2>
        <span className={`verdict ${toneFromVerdict(overview.verdict)}`}>
          {overview.verdict}
        </span>
      </header>
      <p className="analysis-copy">{summary}</p>
      <div className="score-strip">
        <ScorePill label="Overall" score={overview.overallScore} />
        <ScorePill label="Fundamental" score={overview.fundamentalScore} />
        <ScorePill label="Technical" score={overview.technicalScore} />
        <ScorePill label="Sentiment" score={overview.sentimentScore} />
      </div>
      <h3>Data used</h3>
      <MetricList
        rows={[
          ['Fundamental score input', formatScore(overview.fundamentalScore)],
          ['Technical score input', formatScore(overview.technicalScore)],
          ['Sentiment score input', formatScore(overview.sentimentScore)],
          ['Weighted overall score', formatScore(overview.overallScore)],
          ['Model verdict', overview.verdict],
        ]}
      />
    </article>
  )
}

type FundamentalSectionProps = {
  result: AnalysisResponse['fundamental']
  llmSummary?: string
}

const PIE_COLORS = ['#2563eb', '#10b981', '#cbd5e1']

function FundamentalSection({ result, llmSummary }: FundamentalSectionProps) {
  if (!result) {
    return (
      <UnavailablePanel title="Fundamental Analysis">
        Fundamental data is currently unavailable for this ticker.
      </UnavailablePanel>
    )
  }

  const data: FundamentalData = result.data
  const summary = llmSummary?.trim() || summarizeScore(result.score, 'fundamental')

  return (
    <article className="panel reveal">
      <header className="panel-head">
        <h2>Fundamental Analysis</h2>
        <span className="score-tag">{formatScore(result.score)}</span>
      </header>
      <p className="analysis-copy">{summary}</p>
      
      <div className="fundamentals-grid">
        {/* Section A: Valuation */}
        <div className="fund-card">
          <h3>Valuation</h3>
          <div className="fund-metrics">
            <div className="metric">
              <span className="label">P/E (Trailing)</span>
              <span className="val">{formatNumber(data.trailingPE)}</span>
            </div>
            <div className="metric">
              <span className="label">P/S (TTM)</span>
              <span className="val">{formatNumber(data.priceToSalesTrailing12Months)}</span>
            </div>
            <div className="metric">
              <span className="label">P/B Ratio</span>
              <span className="val">{formatNumber(data.priceToBook)}</span>
            </div>
            <div className="metric">
              <span className="label">EV/EBITDA</span>
              <span className="val">{formatNumber(data.enterpriseToEbitda)}</span>
            </div>
          </div>
        </div>

        {/* Section B: Profitability */}
        <div className="fund-card">
          <h3>Profitability</h3>
          <div className="fund-metrics">
            <div className="metric">
              <span className="label">ROE</span>
              <span className="val">{formatPercent(data.returnOnEquity)}</span>
            </div>
            <div className="metric">
              <span className="label">ROCE</span>
              <span className="val">{formatPercent(data.returnOnCapitalEmployed)}</span>
            </div>
            <div className="metric">
              <span className="label">Operating Margin</span>
              <span className="val">{formatPercent(data.operatingMargins)}</span>
            </div>
            <div className="metric">
              <span className="label">Net Margin</span>
              <span className="val">{formatPercent(data.profitMargins)}</span>
            </div>
          </div>
        </div>

        {/* Section C: Solvency */}
        <div className="fund-card">
          <h3>Solvency</h3>
          <div className="fund-metrics">
            <div className="metric">
              <span className="label">Debt/Equity</span>
              <span className="val">{formatNumber(data.debtToEquity)}</span>
            </div>
            <div className="metric">
              <span className="label">Current Ratio</span>
              <span className="val">{formatNumber(data.currentRatio)}</span>
            </div>
            <div className="metric">
              <span className="label">Quick Ratio</span>
              <span className="val">{formatNumber(data.quickRatio)}</span>
            </div>
            <div className="metric">
              <span className="label">Interest Coverage</span>
              <span className="val">{formatNumber(data.interestCoverage)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="charts-grid">
        {data.revenueTrend && data.revenueTrend.length > 0 && (
          <div className="chart-card">
            <h3>Revenue & Net Profit</h3>
            <div className="recharts-wrapper">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.revenueTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="year" tick={{fill: '#6b7280', fontSize: 12}} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(val) => compactFormatter.format(val)} tick={{fill: '#6b7280', fontSize: 12}} axisLine={false} tickLine={false} width={60} />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <RechartsTooltip formatter={(val: any) => usdFormatter.format(val)} cursor={{fill: 'rgba(0,0,0,0.05)'}} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Bar dataKey="revenue" name="Revenue" fill="#94a3b8" radius={[4,4,0,0]} />
                  <Bar dataKey="netProfit" name="Net Profit" fill="#2563eb" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {data.cashflowTrend && data.cashflowTrend.length > 0 && (
          <div className="chart-card">
            <h3>Cash Flow Breakdown</h3>
            <div className="recharts-wrapper">
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={data.cashflowTrend}>
                  <defs>
                    <linearGradient id="colorOp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorFcf" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="year" tick={{fill: '#6b7280', fontSize: 12}} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(val) => compactFormatter.format(val)} tick={{fill: '#6b7280', fontSize: 12}} axisLine={false} tickLine={false} width={60} />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <RechartsTooltip formatter={(val: any) => usdFormatter.format(val)} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Area type="monotone" dataKey="operatingCashFlow" name="Op Cash Flow" stroke="#2563eb" fillOpacity={1} fill="url(#colorOp)" stackId="1" />
                  <Area type="monotone" dataKey="freeCashFlow" name="Free Cash Flow" stroke="#10b981" fillOpacity={1} fill="url(#colorFcf)" stackId="1" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {data.shareholdingPattern && (data.shareholdingPattern.promoters > 0 || data.shareholdingPattern.institutions > 0) && (() => {
          const s = data.shareholdingPattern
          const pieData = [
            { name: 'Insiders', value: s.promoters },
            { name: 'Institutions', value: s.institutions },
            { name: 'Public', value: s.public }
          ].filter(d => d.value > 0)

          return (
            <div className="chart-card">
              <h3>Shareholding Pattern</h3>
              <div className="recharts-wrapper">
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    <RechartsTooltip formatter={(val: any) => `${(val * 100).toFixed(1)}%`} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )
        })()}
      </div>
    </article>
  )
}

type ChartType = 'candle' | 'line' | 'area' | 'bar'
type InsightTone = 'bullish' | 'bearish' | 'neutral'
type PriceLadderKind = 'resistance' | 'current' | 'support'

const CHART_TYPE_OPTIONS: Array<{ value: ChartType; label: string }> = [
  { value: 'candle', label: 'Candlestick' },
  { value: 'bar', label: 'Bar' },
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
]

type TechnicalSectionProps = {
  result: AnalysisResponse['technical']
  selectedPeriod: string
  llmSummary?: string
  ticker: string
  beta: number | null
}

function TechnicalSection({
  result,
  selectedPeriod,
  llmSummary,
  ticker,
  beta,
}: TechnicalSectionProps) {
  if (!result) {
    return (
      <UnavailablePanel title="Technical Analysis">
        Technical price history is currently unavailable for this ticker.
      </UnavailablePanel>
    )
  }

  const data = resolveTechnicalData(result, selectedPeriod)
  const trendText =
    llmSummary?.trim() || describeTechnicalSignal(result) || describeTrend(data)
  const technicalBullets = extractBulletPoints(trendText)
  const indicators = result.indicators
  const structure = result.structure
  const sma200 = isFiniteNumber(indicators?.SMA200) ? indicators.SMA200 : null
  const trendBias = resolveTrendBias(result.trend, result.signal)
  const rsiWidget = resolveRsiInsightWidget(
    typeof data.rsi === 'number' ? data.rsi : indicators?.RSI,
  )
  const macdWidget = resolveMacdInsightWidget(
    indicators?.MACD,
    indicators?.MACD_signal,
  )
  const adxWidget = resolveAdxInsightWidget(indicators?.ADX, trendBias)
  const momentumWidget = resolveMomentumInsightWidget({
    trend: result.trend,
    signal: result.signal,
    score: result.score,
    close: data.lastClose,
    sma20: data.sma20,
    sma50: data.sma50,
    rsi: rsiWidget.numericValue,
    macdTone: macdWidget.tone,
  })
  const currentPrice = isFiniteNumber(data.lastClose)
    ? data.lastClose
    : isFiniteNumber(indicators?.close)
      ? indicators.close
      : null
  const priceLadderRows = buildPriceLadderRows({
    currentPrice,
    supports: structure?.support,
    resistances: structure?.resistance,
  })
  const movingAverageAlignment = resolveMovingAverageAlignment({
    price: currentPrice,
    sma20: data.sma20,
    sma50: data.sma50,
    sma200,
  })
  const volumeSnapshot = buildVolumeSnapshot(data.ohlcv)
  const [nearestSupport] = pickSupportLevels(
    uniqueSortedLevels(structure?.support),
    currentPrice,
  )
  const [nearestResistance] = pickResistanceLevels(
    uniqueSortedLevels(structure?.resistance),
    currentPrice,
  )
  const riskMetrics = buildRiskMetrics({
    recentCloses: volumeSnapshot.recentCloses,
    beta,
    currentPrice,
    nearestSupport,
    nearestResistance,
  })
  const volatilityMetric =
    riskMetrics.find((metric) => metric.label === 'Volatility (30 day)') ?? null
  const indicatorMiniCharts = buildIndicatorMiniCharts(data.ohlcv)
  const priceRangeMarkers = buildPriceRangeMarkers(priceLadderRows)
  const currentPriceMarker =
    priceRangeMarkers.find((marker) => marker.key === 'current-price') ?? null
  const support1Marker =
    priceRangeMarkers.find((marker) => marker.key === 'support-1') ?? null
  const resistance1Marker =
    priceRangeMarkers.find((marker) => marker.key === 'resistance-1') ?? null
  const supportDistanceBand = buildPriceRangeBand(
    support1Marker?.position,
    currentPriceMarker?.position,
  )
  const resistanceDistanceBand = buildPriceRangeBand(
    currentPriceMarker?.position,
    resistance1Marker?.position,
  )
  const priceMarkerAnimationKey = priceRangeMarkers
    .map((marker) => `${marker.key}:${marker.position.toFixed(2)}:${marker.value.toFixed(2)}`)
    .join('|')
  const volatilityValue = volatilityMetric?.value ?? 'N/A'
  const volatilityNumericValue = parseMetricNumber(volatilityValue)
  const sma20Position = resolveAveragePositionStatus(data.sma20, currentPrice)
  const sma50Position = resolveAveragePositionStatus(data.sma50, currentPrice)
  const sma200Position = resolveAveragePositionStatus(sma200, currentPrice)

  const snapshotTiles: TechnicalSnapshotRow[] = [
    {
      key: 'trend',
      metric: 'Trend',
      value: safeText(result.trend),
      status: toneToLabel(trendBias),
      tone: trendBias,
      progressPercent: isFiniteNumber(result.score)
        ? clampPercent(result.score)
        : toneToPercent(trendBias),
    },
    {
      key: 'score',
      metric: 'Technical Score',
      value: formatScore(result.score),
      status: scoreBand(result.score),
      tone: scoreToTone(result.score),
      progressPercent: isFiniteNumber(result.score) ? clampPercent(result.score) : 50,
      numeric: isFiniteNumber(result.score)
        ? { value: result.score, format: 'number', decimals: 1 }
        : undefined,
    },
    {
      key: 'momentum',
      metric: 'Momentum',
      value: momentumWidget.valueText,
      status: momentumWidget.signalLabel,
      tone: momentumWidget.tone,
      progressPercent: momentumWidget.percent,
      numeric: { value: momentumWidget.percent, format: 'number', decimals: 1 },
    },
    {
      key: 'volatility',
      metric: 'Volatility',
      value: volatilityValue,
      status: volatilityMetric ? riskLevelLabel(volatilityMetric.level) : 'Not available',
      tone: volatilityMetric ? riskLevelToTone(volatilityMetric.level) : 'neutral',
      progressPercent: isFiniteNumber(volatilityNumericValue)
        ? clampPercent((volatilityNumericValue / 60) * 100)
        : 50,
      numeric: isFiniteNumber(volatilityNumericValue)
        ? { value: volatilityNumericValue, format: 'percent', decimals: 1 }
        : undefined,
    },
    {
      key: 'adx',
      metric: 'ADX',
      value: adxWidget.valueText,
      status: adxWidget.contextLabel,
      tone: adxWidget.tone,
      progressPercent: adxWidget.percent,
      numeric: isFiniteNumber(adxWidget.numericValue)
        ? { value: adxWidget.numericValue, format: 'number', decimals: 1 }
        : undefined,
    },
    {
      key: 'rsi',
      metric: 'RSI (14)',
      value: rsiWidget.valueText,
      status: resolveRsiStatusLabel(rsiWidget.contextLabel),
      tone: rsiWidget.tone,
      progressPercent: rsiWidget.percent,
      numeric: isFiniteNumber(rsiWidget.numericValue)
        ? { value: rsiWidget.numericValue, format: 'number', decimals: 1 }
        : undefined,
    },
    {
      key: 'macd',
      metric: 'MACD Signal',
      value: toneToLabel(macdWidget.tone),
      status: toneArrow(macdWidget.tone),
      tone: macdWidget.tone,
      progressPercent: macdWidget.percent,
    },
    {
      key: 'sma20',
      metric: '20 Day SMA',
      value: formatCurrency(data.sma20, 'USD'),
      status: sma20Position.label,
      tone: sma20Position.tone,
      progressPercent: resolveMovingAverageProgress(data.sma20, currentPrice),
      numeric: isFiniteNumber(data.sma20)
        ? { value: data.sma20, format: 'currency', decimals: 2 }
        : undefined,
    },
    {
      key: 'sma50',
      metric: '50 Day SMA',
      value: formatCurrency(data.sma50, 'USD'),
      status: sma50Position.label,
      tone: sma50Position.tone,
      progressPercent: resolveMovingAverageProgress(data.sma50, currentPrice),
      numeric: isFiniteNumber(data.sma50)
        ? { value: data.sma50, format: 'currency', decimals: 2 }
        : undefined,
    },
    {
      key: 'sma200',
      metric: '200 Day SMA',
      value: formatCurrency(sma200, 'USD'),
      status: sma200Position.label,
      tone: sma200Position.tone,
      progressPercent: resolveMovingAverageProgress(sma200, currentPrice),
      numeric: isFiniteNumber(sma200)
        ? { value: sma200, format: 'currency', decimals: 2 }
        : undefined,
    },
  ]

  const tradingViewSymbol = toTradingViewSymbol(data.symbol)
  const chartContainerRef = useRef<HTMLDivElement | null>(null)
  const [chartType, setChartType] = useState<ChartType>('candle')
  const [chartDuration, setChartDuration] = useState<string>('1M')
  const [chartData, setChartData] = useState<any[]>([])
  const [showPriceRangeMarkers, setShowPriceRangeMarkers] = useState(false)

  useEffect(() => {
    setShowPriceRangeMarkers(false)
    if (priceRangeMarkers.length === 0) {
      return
    }

    const frame = requestAnimationFrame(() => {
      setShowPriceRangeMarkers(true)
    })
    return () => cancelAnimationFrame(frame)
  }, [priceMarkerAnimationKey])

  // Fetch fine-grained chart data when duration changes
  useEffect(() => {
    let cancelled = false;

    // We import dynamically if needed, but since it's just a fetch it's fine.
    // However, we need to import fetchChartData into this file.
    import('./api').then(({ fetchChartData }) => {
      fetchChartData(ticker, chartDuration)
        .then((payload) => {
          if (!cancelled) {
            setChartData(payload.ohlcv || [])
          }
        })
        .catch((err) => {
          console.error("Failed to fetch chart data", err)
        })
    })

    return () => {
      cancelled = true
    }
  }, [ticker, chartDuration])

  useEffect(() => {
    let cancelled = false
    const container = chartContainerRef.current
    if (!container) return

    let chart: any | null = null
    let resizeObserver: ResizeObserver | null = null

    const initChart = async () => {
      // Lazy-load lightweight-charts from a CDN the first time it is needed.
      let lib = (window as any).LightweightCharts
      if (!lib) {
        const script = document.createElement('script')
        script.src =
          'https://unpkg.com/lightweight-charts@4.2.1/dist/lightweight-charts.standalone.production.js'
        script.async = true

        await new Promise<void>((resolve, reject) => {
          script.onload = () => resolve()
          script.onerror = () => reject(new Error('Failed to load chart library'))
          document.head.appendChild(script)
        })

        lib = (window as any).LightweightCharts
        if (!lib) return
      }

      if (cancelled) return

      const { width, height } = container.getBoundingClientRect()
      chart = lib.createChart(container, {
        width,
        height,
        layout: {
          background: { color: 'white' },
          textColor: '#111827',
        },
        rightPriceScale: {
          visible: true,
        },
        timeScale: {
          borderColor: '#e5e7eb',
          timeVisible: true,
        },
        grid: {
          vertLines: { color: '#f3f4f6' },
          horzLines: { color: '#f3f4f6' },
        },
        localization: {
          locale: 'en-US',
        },
        handleScroll: false,
        handleScale: false,
      })

      const ohlcv = chartData.length > 0 ? chartData : (data.ohlcv ?? [])
      let candles = ohlcv
        .map((bar) => {
          const t = bar.date
          const dt = typeof t === 'string' ? new Date(t) : new Date(t * 1000)
          if (Number.isNaN(dt.getTime())) {
            return null
          }
          let ts = dt.getTime() / 1000

          // Lightweight charts requires strictly increasing timestamps. 
          // For intraday, we must pass it as a unix timestamp. For daily, we can use strings but timestamp is safer.
          // Note for intraday data we must ensure times match the local timezone of the exchange, but standard unix timestamp works best if auto-scaling.
          return {
            time: ts as any,
            open: bar.open,
            high: bar.high,
            low: bar.low,
            close: bar.close,
          }
        })
        .filter(Boolean) as Array<{
          time: any
          open: number
          high: number
          low: number
          close: number
        }>

      // Sort candles by time just in case to avoid LightweightCharts errors
      candles.sort((a, b) => a.time - b.time)

      // Deduplicate by time to avoid LightweightCharts errors
      const uniqueCandles: typeof candles = []
      const seenTimes = new Set()
      for (const candle of candles) {
        if (!seenTimes.has(candle.time)) {
          seenTimes.add(candle.time)
          uniqueCandles.push(candle)
        }
      }
      candles = uniqueCandles

      const lineData = candles.map((c) => ({ time: c.time, value: c.close }))

      let series: any
      if (chartType === 'candle') {
        series = chart.addCandlestickSeries()
        series.setData(candles)
      } else if (chartType === 'bar') {
        series = chart.addBarSeries()
        series.setData(candles)
      } else if (chartType === 'area') {
        series = chart.addAreaSeries({
          lineColor: '#2962ff',
          topColor: 'rgba(41, 98, 255, 0.4)',
          bottomColor: 'rgba(41, 98, 255, 0.0)',
        })
        series.setData(lineData)
      } else {
        series = chart.addLineSeries({ color: '#2962ff' })
        series.setData(lineData)
      }

      chart.timeScale().fitContent()

      if (cancelled) {
        if (chart) chart.remove()
        return
      }

      const resize = () => {
        if (!container || !chart) return
        const { width: w, height: h } = container.getBoundingClientRect()
        chart.applyOptions({ width: w, height: h })
      }
      resize()
      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(container)
    }

    initChart().catch(() => {
      // Fail silently; layout still renders without the chart.
    })

    return () => {
      cancelled = true
      if (resizeObserver && container) {
        resizeObserver.unobserve(container)
      }
      if (chart) {
        chart.remove()
      }
    }
  }, [data.ohlcv, chartData, tradingViewSymbol, selectedPeriod, chartType, chartDuration])

  return (
    <article className="panel reveal">
      <header className="panel-head">
        <h2>Technical Analysis</h2>
        <span className="score-tag">{formatScore(result.score)}</span>
      </header>
      {technicalBullets.length > 0 ? (
        <ul className="analysis-bullets">
          {technicalBullets.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="analysis-copy">{trendText}</p>
      )}
      <div className="technical-layout">
        <div className="chart-block">
          <div className="chart-controls" style={{ display: 'flex', gap: '8px', marginBottom: '12px', alignItems: 'center' }}>
            <div className="chart-type-selector" style={{ margin: 0 }}>
              {['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y', 'ALL'].map((dur) => (
                <button
                  key={dur}
                  type="button"
                  className={chartDuration === dur ? 'active' : ''}
                  onClick={() => setChartDuration(dur)}
                >
                  {dur}
                </button>
              ))}
            </div>
            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value as ChartType)}
              aria-label="Select chart type"
              style={{ marginLeft: 'auto', padding: '4px 8px', borderRadius: '4px', border: '1px solid #e5e7eb' }}
            >
              {CHART_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div
            key={`${chartType}-${chartDuration}`}
            className="tv-chart-wrap"
            ref={chartContainerRef}
          />
        </div>
        <aside className="technical-side">
          <h3>Data used</h3>
          <MetricList
            rows={[
              ['Trend Direction', safeText(result.trend)],
              ['Technical Score', formatScore(result.score)],
              ['RSI (14)', formatNumber(data.rsi)],
              ['MACD Signal', formatNumber(indicators?.MACD_signal)],
              ['ADX (Trend Strength)', formatNumber(indicators?.ADX)],
              ['20D Moving Average', formatCurrency(data.sma20, 'USD')],
              ['50D Moving Average', formatCurrency(data.sma50, 'USD')],
              ['200D Moving Average', formatCurrency(indicators?.SMA200, 'USD')],
              ['Support Level', formatPrimaryLevel(structure?.support)],
              ['Resistance Level', formatPrimaryLevel(structure?.resistance)],
            ]}
          />
        </aside>
      </div>
      <section className="technical-snapshot-section" aria-label="Technical snapshot">
        <h3 className="technical-snapshot-title">Technical Snapshot</h3>
        <div className="technical-snapshot-panels">
          <article className="snapshot-panel">
            <header className="snapshot-panel-head">
              <h4>Technical Snapshot</h4>
              <span className={`snapshot-badge tone-${movingAverageAlignment.tone}`}>
                {movingAverageAlignment.label}
              </span>
            </header>
            <div className="snapshot-tiles-grid">
              {snapshotTiles.map((tile) => (
                <SnapshotMetricTile key={tile.key} tile={tile} />
              ))}
            </div>
          </article>

          <article className="snapshot-panel">
            <header className="snapshot-panel-head">
              <h4>Price Levels</h4>
            </header>
            <div className="price-range-wrap" aria-label="Support and resistance range">
              <div className="price-range-track">
                <span className="price-range-line" />
                {supportDistanceBand && (
                  <span
                    className="price-range-distance support"
                    style={{
                      left: `${supportDistanceBand.left}%`,
                      width: `${supportDistanceBand.width}%`,
                    }}
                  />
                )}
                {resistanceDistanceBand && (
                  <span
                    className="price-range-distance resistance"
                    style={{
                      left: `${resistanceDistanceBand.left}%`,
                      width: `${resistanceDistanceBand.width}%`,
                    }}
                  />
                )}
                {priceRangeMarkers.map((marker, index) => (
                  <div
                    key={marker.key}
                    className={`price-range-marker kind-${marker.kind} anchor-${marker.anchor} ${index % 2 === 0 ? 'above' : 'below'}`}
                    style={{
                      left: showPriceRangeMarkers ? `${marker.position}%` : '50%',
                      opacity: showPriceRangeMarkers ? 1 : 0,
                      transitionDelay: `${index * 70}ms`,
                    }}
                    tabIndex={0}
                  >
                    <span className="price-range-marker-dot" />
                    <div className="price-range-tooltip" role="tooltip">
                      <p className="price-range-tooltip-label">{marker.label}</p>
                      <p className="price-range-tooltip-value">
                        {formatCurrency(marker.value, 'USD')}
                      </p>
                      <p className="price-range-tooltip-distance">
                        {resolvePriceMarkerTooltipDistance(marker)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="price-range-cards">
                {priceLadderRows.map((row) => (
                  <article key={row.key} className={`price-range-card kind-${row.kind}`}>
                    <div className="price-range-card-head">
                      <span>{row.label}</span>
                      <strong>{formatCurrency(row.value, 'USD')}</strong>
                    </div>
                    <p>{row.distanceLabel || 'N/A'}</p>
                  </article>
                ))}
              </div>
            </div>
          </article>

          <article className="snapshot-panel">
            <header className="snapshot-panel-head">
              <h4>Indicator Trends</h4>
            </header>
            <div className="indicator-dashboard-grid">
              {indicatorMiniCharts.map((chart) => (
                <article key={chart.key} className="indicator-mini-chart">
                  <header className="indicator-mini-head">
                    <h5>{chart.title}</h5>
                    <strong>{chart.currentValueLabel}</strong>
                  </header>
                  <div className="indicator-mini-body">
                    {chart.series.length > 0 ? (
                      <IndicatorMiniSparkline chart={chart} />
                    ) : (
                      <div className="indicator-mini-empty">No data</div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </article>
        </div>
      </section>
    </article>
  )
}

type SentimentSectionProps = {
  result: AnalysisResponse['sentiment']
  llmSummary?: string
}

function SentimentSection({ result, llmSummary }: SentimentSectionProps) {
  if (!result) {
    return (
      <UnavailablePanel title="Sentiment Analysis">
        News sentiment is currently unavailable for this ticker.
      </UnavailablePanel>
    )
  }

  const headlines: SentimentHeadline[] = result.headlines
  const summary = llmSummary?.trim() || summarizeScore(result.score, 'sentiment')
  const sentimentSummary = parseSentimentSummary(summary)

  return (
    <article className="panel reveal">
      <header className="panel-head">
        <h2>Sentiment Analysis</h2>
        <span className="score-tag">{formatScore(result.score)}</span>
      </header>
      <h3>Main Insights from news headlines</h3>
      {sentimentSummary.insights.length > 0 || sentimentSummary.summary ? (
        <div className="sentiment-summary">
          {sentimentSummary.insights.length > 0 && (
            <ul className="analysis-bullets">
              {sentimentSummary.insights.map((item, index) => (
                <li key={`${item}-${index}`}>{item}</li>
              ))}
            </ul>
          )}
          {sentimentSummary.summary && (
            <>
              <h3>Summary</h3>
              <p className="analysis-copy">{sentimentSummary.summary}</p>
            </>
          )}
        </div>
      ) : (
        <p className="analysis-copy">{summary}</p>
      )}
      <h3>Data used</h3>
      <MetricList
        rows={[
          ['Headline count used', `${result.data.count}`],
          ['Aggregate sentiment score', formatScore(result.score)],
          ['Signal band', scoreBand(result.score)],
        ]}
      />

      <div className="headline-list">
        {headlines.length === 0 && <p>No headlines returned from the news sources.</p>}
        {headlines.map((headline, index) => (
          <article className="headline-item" key={`${headline.title}-${index}`}>
            <div className="headline-row">
              {headline.link ? (
                <a href={headline.link} target="_blank" rel="noreferrer">
                  {headline.title}
                </a>
              ) : (
                <p>{headline.title}</p>
              )}
              <span className="headline-time">
                {formatHeadlineTimestamp(resolveHeadlineTimestamp(headline))}
              </span>
            </div>
          </article>
        ))}
      </div>
    </article>
  )
}

function SnapshotMetricTile({ tile }: { tile: TechnicalSnapshotRow }) {
  const animatedValue = useAnimatedNumber(tile.numeric?.value ?? null, 800)
  const animatedProgress = useAnimatedNumber(tile.progressPercent, 800)
  const valueLabel =
    tile.numeric && isFiniteNumber(animatedValue)
      ? formatAnimatedSnapshotValue(animatedValue, tile.numeric)
      : tile.value

  return (
    <article className={`snapshot-tile tone-${tile.tone}`}>
      <p className="snapshot-tile-label">{tile.metric}</p>
      <div className="snapshot-tile-value-row">
        <p className="snapshot-tile-value">{valueLabel}</p>
        <span
          className={`snapshot-value-dot tone-${tile.tone}`}
          aria-hidden="true"
        />
      </div>
      <div
        className={`snapshot-tile-meter tone-${tile.tone}`}
        role="presentation"
        aria-hidden="true"
      >
        <span style={{ width: `${clampPercent(animatedProgress ?? 0)}%` }} />
      </div>
      <p className={`snapshot-tile-status tone-${tile.tone}`}>{tile.status}</p>
    </article>
  )
}

function IndicatorMiniSparkline({ chart }: { chart: IndicatorMiniChart }) {
  const gradientId = `indicator-mini-gradient-${chart.key}`

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={chart.series} margin={{ top: 8, right: 2, left: 2, bottom: 6 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={chart.stroke} stopOpacity={0.35} />
            <stop offset="100%" stopColor={chart.stroke} stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <XAxis hide dataKey="index" />
        <YAxis hide domain={['auto', 'auto']} />
        <RechartsTooltip
          cursor={{ stroke: chart.stroke, strokeOpacity: 0.28, strokeWidth: 1 }}
          content={<IndicatorMiniTooltip chart={chart} />}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={chart.stroke}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          isAnimationActive
          animationDuration={900}
          animationEasing="ease-out"
          dot={(dotProps) => (
            <IndicatorMiniPoint dotProps={dotProps} stroke={chart.stroke} />
          )}
          activeDot={{
            r: 4.2,
            stroke: '#ffffff',
            strokeWidth: 2,
            fill: chart.stroke,
          }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function IndicatorMiniPoint({
  dotProps,
  stroke,
}: {
  dotProps: {
    cx?: number
    cy?: number
    payload?: IndicatorMiniSeriesPoint
  }
  stroke: string
}) {
  const { cx, cy, payload } = dotProps
  if (!isFiniteNumber(cx) || !isFiniteNumber(cy)) {
    return null
  }

  return (
    <circle
      cx={cx}
      cy={cy}
      r={1.9}
      fill={stroke}
      className="indicator-mini-point"
      style={{ animationDelay: `${80 + (payload?.index ?? 0) * 22}ms` }}
    />
  )
}

function IndicatorMiniTooltip({
  active,
  payload,
  chart,
}: {
  active?: boolean
  payload?: Array<{ payload: IndicatorMiniSeriesPoint; value: number }>
  chart: IndicatorMiniChart
}) {
  if (!active || !payload || payload.length === 0) {
    return null
  }

  const point = payload[0]?.payload
  if (!point) {
    return null
  }

  return (
    <div className="indicator-mini-tooltip">
      <p className="indicator-mini-tooltip-time">{point.timestampLabel}</p>
      <p className="indicator-mini-tooltip-value">
        {formatMiniTooltipValue(chart.key, point.value)}
      </p>
    </div>
  )
}

function FullReportSection({ analysis }: { analysis: AnalysisResponse }) {
  const reportText = normalizeInlineBulletLists(
    emphasizeSummaryLabel(analysis.report?.trim() ?? ''),
  )
  const source = analysis.reportSource?.trim() ?? 'unknown'

  if (!reportText) {
    return (
      <UnavailablePanel title="FULL REPORT">
        Full report text is not available for this request.
      </UnavailablePanel>
    )
  }

  return (
    <article className="panel reveal">
      <header className="panel-head">
        <h2>FULL REPORT</h2>
        <span className="score-tag">{source.toUpperCase()}</span>
      </header>
      <div className="full-report-markdown">
        <MarkdownContent text={reportText} />
      </div>
    </article>
  )
}

function emphasizeSummaryLabel(text: string): string {
  return text.replace(/^(\s*)Summary:\s*/gim, '$1**Summary:** ')
}

function normalizeInlineBulletLists(text: string): string {
  // Strict bullet boundary: only ". -" should be treated as a new bullet.
  return text.replace(/\. (?=-\s+\S)/g, '.\n')
}

function MarkdownContent({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactElement[] = []
  let i = 0
  let key = 0

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      i += 1
      continue
    }

    if (line.startsWith('```')) {
      const language = line.slice(3).trim()
      i += 1
      const codeLines: string[] = []
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i += 1
      }
      if (i < lines.length && lines[i].startsWith('```')) {
        i += 1
      }
      blocks.push(
        <pre key={`md-${key++}`}>
          <code className={language ? `language-${language}` : undefined}>
            {codeLines.join('\n')}
          </code>
        </pre>,
      )
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const content = renderMarkdownInline(headingMatch[2], `md-${key}-h`)
      const headingKey = `md-${key++}`
      if (level === 1) {
        blocks.push(<h1 key={headingKey}>{content}</h1>)
      } else if (level === 2) {
        blocks.push(<h2 key={headingKey}>{content}</h2>)
      } else if (level === 3) {
        blocks.push(<h3 key={headingKey}>{content}</h3>)
      } else if (level === 4) {
        blocks.push(<h4 key={headingKey}>{content}</h4>)
      } else if (level === 5) {
        blocks.push(<h5 key={headingKey}>{content}</h5>)
      } else {
        blocks.push(<h6 key={headingKey}>{content}</h6>)
      }
      i += 1
      continue
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ''))
        i += 1
      }
      blocks.push(
        <blockquote key={`md-${key++}`}>
          <MarkdownParagraphs lines={quoteLines} blockKeyPrefix={`md-${key}-q`} />
        </blockquote>,
      )
      continue
    }

    if (/^[-*+]\s+/.test(line)) {
      const items: ReactElement[] = []
      while (i < lines.length && /^[-*+]\s+/.test(lines[i])) {
        const item = lines[i].replace(/^[-*+]\s+/, '')
        items.push(
          <li key={`md-${key}-ul-${items.length}`}>
            {renderMarkdownInline(item, `md-${key}-ul-inline-${items.length}`)}
          </li>,
        )
        i += 1
      }
      blocks.push(<ul key={`md-${key++}`}>{items}</ul>)
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: ReactElement[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        const item = lines[i].replace(/^\d+\.\s+/, '')
        items.push(
          <li key={`md-${key}-ol-${items.length}`}>
            {renderMarkdownInline(item, `md-${key}-ol-inline-${items.length}`)}
          </li>,
        )
        i += 1
      }
      blocks.push(<ol key={`md-${key++}`}>{items}</ol>)
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push(<hr key={`md-${key++}`} />)
      i += 1
      continue
    }

    const paragraphLines: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].startsWith('```') &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^[-*+]\s+/.test(lines[i]) &&
      !/^\d+\.\s+/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim())
    ) {
      paragraphLines.push(lines[i])
      i += 1
    }
    blocks.push(
      <p key={`md-${key++}`}>
        {renderMarkdownInline(paragraphLines.join(' '), `md-${key}-p`)}
      </p>,
    )
  }

  return <>{blocks}</>
}

function MarkdownParagraphs({
  lines,
  blockKeyPrefix,
}: {
  lines: string[]
  blockKeyPrefix: string
}) {
  const parts = lines.join('\n').split(/\n\s*\n/g).filter((item) => item.trim())
  return (
    <>
      {parts.map((part, index) => (
        <p key={`${blockKeyPrefix}-${index}`}>
          {renderMarkdownInline(part.replace(/\n/g, ' '), `${blockKeyPrefix}-inline-${index}`)}
        </p>
      ))}
    </>
  )
}

function renderMarkdownInline(text: string, keyPrefix: string) {
  const pattern =
    /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\((https?:\/\/[^\s)]+)\))/g
  const nodes: Array<string | ReactElement> = []
  let lastIndex = 0
  let match = pattern.exec(text)
  let tokenIndex = 0

  while (match) {
    const [token] = match
    const index = match.index
    if (index > lastIndex) {
      nodes.push(text.slice(lastIndex, index))
    }

    if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code key={`${keyPrefix}-code-${tokenIndex++}`}>
          {token.slice(1, token.length - 1)}
        </code>,
      )
    } else if (
      (token.startsWith('**') && token.endsWith('**')) ||
      (token.startsWith('__') && token.endsWith('__'))
    ) {
      nodes.push(
        <strong key={`${keyPrefix}-strong-${tokenIndex++}`}>
          {token.slice(2, token.length - 2)}
        </strong>,
      )
    } else if (
      (token.startsWith('*') && token.endsWith('*')) ||
      (token.startsWith('_') && token.endsWith('_'))
    ) {
      nodes.push(
        <em key={`${keyPrefix}-em-${tokenIndex++}`}>
          {token.slice(1, token.length - 1)}
        </em>,
      )
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/)
      if (linkMatch) {
        nodes.push(
          <a
            key={`${keyPrefix}-link-${tokenIndex++}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
          >
            {linkMatch[1]}
          </a>,
        )
      } else {
        nodes.push(token)
      }
    } else {
      nodes.push(token)
    }

    lastIndex = index + token.length
    match = pattern.exec(text)
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }

  return nodes
}

function renderSection(
  tab: AnalysisTab,
  analysis: AnalysisResponse,
  selectedPeriod: string,
  ticker: string,
) {
  const llmSections: Partial<ReportSections> = analysis.reportSections ?? {}

  switch (tab) {
    case 'fundamental':
      return (
        <FundamentalSection
          result={analysis.fundamental}
          llmSummary={llmSections.fundamental}
        />
      )
    case 'technical':
      return (
        <TechnicalSection
          result={analysis.technical}
          selectedPeriod={selectedPeriod}
          llmSummary={llmSections.technical}
          ticker={ticker}
          beta={analysis.fundamental?.data?.beta ?? null}
        />
      )
    case 'sentiment':
      return (
        <SentimentSection
          result={analysis.sentiment}
          llmSummary={llmSections.sentiment}
        />
      )
    case 'full-report':
      return <FullReportSection analysis={analysis} />
    case 'overview':
    default:
      return (
        <OverviewSection
          overview={analysis.overview}
          llmSummary={llmSections.overall}
        />
      )
  }
}

type ScorePillProps = {
  label: string
  score: number | null
}

function ScorePill({ label, score }: ScorePillProps) {
  return (
    <div className="score-pill">
      <p>{label}</p>
      <strong>{formatScore(score)}</strong>
      <span>{scoreBand(score)}</span>
    </div>
  )
}

type MetricListProps = {
  rows: Array<[string, string]>
}

function MetricList({ rows }: MetricListProps) {
  return (
    <dl className="metric-list">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

type UnavailablePanelProps = {
  title: string
  children: string
}

function UnavailablePanel({ title, children }: UnavailablePanelProps) {
  return (
    <article className="panel reveal">
      <header className="panel-head">
        <h2>{title}</h2>
        <span className="score-tag muted">N/A</span>
      </header>
      <p className="analysis-copy">{children}</p>
    </article>
  )
}

function LoadingPanel({ tab }: { tab: AnalysisTab }) {
  const label = ANALYSIS_TABS.find((item) => item.key === tab)?.label ?? 'Analysis'
  return (
    <article className="panel reveal loading-panel">
      <header className="panel-head">
        <h2>{label} Analysis</h2>
      </header>
      <div className="loading-lines">
        <span />
        <span />
        <span />
      </div>
    </article>
  )
}

function usePathRouter() {
  const [locationState, setLocationState] = useState(() => ({
    pathname: window.location.pathname,
    search: window.location.search,
  }))

  useEffect(() => {
    const onPopState = () => {
      setLocationState({
        pathname: window.location.pathname,
        search: window.location.search,
      })
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
    }
  }, [])

  const navigate = useCallback((path: string) => {
    const target = new URL(path, window.location.origin)
    const current = `${window.location.pathname}${window.location.search}`
    const next = `${target.pathname}${target.search}`
    if (next !== current) {
      window.history.pushState({}, '', next)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    setLocationState({
      pathname: target.pathname,
      search: target.search,
    })
  }, [])

  return { pathname: locationState.pathname, search: locationState.search, navigate }
}

function parseRoute(pathname: string): AppRoute {
  const match = pathname.match(/^\/stock\/([^/]+)(?:\/([^/]+))?\/?$/i)
  if (!match) {
    return { type: 'home' }
  }

  try {
    const ticker = normalizeTicker(decodeURIComponent(match[1]))
    if (!ticker) {
      return { type: 'home' }
    }

    const tab = normalizeTab(match[2] ?? '')
    return { type: 'stock', ticker, tab }
  } catch {
    return { type: 'home' }
  }
}

function parsePeriodFromSearch(search: string): string {
  const params = new URLSearchParams(search)
  const raw = params.get('period') ?? '1y'
  return normalizePeriod(raw)
}

function normalizePeriod(value: string): string {
  const allowed = new Set(PERIOD_OPTIONS.map((option) => option.value))
  if (allowed.has(value)) {
    return value
  }
  return '1y'
}

function normalizeTab(value: string): AnalysisTab {
  const raw = value.trim().toLowerCase()
  if (
    raw === 'fundamental' ||
    raw === 'technical' ||
    raw === 'sentiment' ||
    raw === 'full-report'
  ) {
    return raw
  }
  return 'overview'
}

function normalizeTicker(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, '')
}

function toTradingViewSymbol(symbol: string): string {
  const clean = symbol.trim().toUpperCase()
  if (!clean) {
    return 'AAPL'
  }
  if (clean.includes(':')) {
    return clean
  }
  return clean
}

// Legacy TradingView helpers removed now that charts use Lightweight Charts.

function formatScore(score: number | null): string {
  if (typeof score !== 'number') {
    return 'N/A'
  }
  return score.toFixed(1)
}

function scoreBand(score: number | null): string {
  if (typeof score !== 'number') {
    return 'Unknown'
  }
  if (score >= 65) {
    return 'Bullish'
  }
  if (score >= 45) {
    return 'Neutral'
  }
  return 'Bearish'
}

function toneFromVerdict(verdict: string): string {
  const value = verdict.toLowerCase()
  if (value === 'buy') {
    return 'positive'
  }
  if (value === 'hold') {
    return 'neutral'
  }
  if (value === 'sell') {
    return 'negative'
  }
  return 'neutral'
}

function formatNumber(value: number | null | undefined): string {
  if (typeof value !== 'number') {
    return 'N/A'
  }
  return decimalFormatter.format(value)
}



function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number') {
    return 'N/A'
  }
  return `${(value * 100).toFixed(2)}%`
}

function formatCurrency(
  value: number | null | undefined,
  currency: string,
): string {
  if (typeof value !== 'number') {
    return 'N/A'
  }
  if (currency === 'USD') {
    return usdFormatter.format(value)
  }
  return `${decimalFormatter.format(value)} ${currency}`
}

function formatPrimaryLevel(levels: number[] | null | undefined): string {
  if (!Array.isArray(levels) || levels.length === 0) {
    return 'N/A'
  }
  const first = levels.find((level) => typeof level === 'number' && Number.isFinite(level))
  if (typeof first !== 'number') {
    return 'N/A'
  }
  return formatCurrency(first, 'USD')
}

function safeText(value: string | null | undefined): string {
  if (!value) {
    return 'N/A'
  }
  return value
}

type InsightWidgetState = {
  tone: InsightTone
  valueText: string
  contextLabel: string
  percent: number
  numericValue: number | null
}

type TechnicalSnapshotRow = {
  key: string
  metric: string
  value: string
  status: string
  tone: InsightTone
  progressPercent: number
  numeric?: {
    value: number
    format: 'number' | 'currency' | 'percent'
    decimals: number
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function toneToPercent(tone: InsightTone): number {
  if (tone === 'bullish') {
    return 78
  }
  if (tone === 'bearish') {
    return 22
  }
  return 50
}

function parseMetricNumber(value: string): number | null {
  const cleaned = value.replace(/[^0-9.+-]/g, '')
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function resolveMovingAverageProgress(
  movingAverage: number | null,
  currentPrice: number | null,
): number {
  if (!isFiniteNumber(movingAverage) || !isFiniteNumber(currentPrice) || movingAverage === 0) {
    return 50
  }
  const deltaPercent = ((currentPrice - movingAverage) / movingAverage) * 100
  return clampPercent(50 + deltaPercent * 5)
}

function useAnimatedNumber(target: number | null, durationMs: number): number | null {
  const [animated, setAnimated] = useState(0)

  useEffect(() => {
    if (!isFiniteNumber(target)) {
      setAnimated(0)
      return
    }

    let frame = 0
    const startValue = 0
    const startTime = performance.now()

    const step = (timestamp: number) => {
      const elapsed = timestamp - startTime
      const progress = Math.min(1, elapsed / durationMs)
      const eased = 1 - (1 - progress) ** 3
      setAnimated(startValue + (target - startValue) * eased)
      if (progress < 1) {
        frame = requestAnimationFrame(step)
      }
    }

    setAnimated(0)
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, durationMs])

  return isFiniteNumber(target) ? animated : null
}

function formatFixedDecimal(value: number, decimals: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function formatAnimatedSnapshotValue(
  value: number,
  numeric: NonNullable<TechnicalSnapshotRow['numeric']>,
): string {
  if (numeric.format === 'currency') {
    return `${value < 0 ? '-' : ''}$${formatFixedDecimal(Math.abs(value), numeric.decimals)}`
  }
  if (numeric.format === 'percent') {
    return `${formatFixedDecimal(value, numeric.decimals)}%`
  }
  return formatFixedDecimal(value, numeric.decimals)
}

function toneToLabel(tone: InsightTone): 'Bullish' | 'Bearish' | 'Neutral' {
  if (tone === 'bullish') {
    return 'Bullish'
  }
  if (tone === 'bearish') {
    return 'Bearish'
  }
  return 'Neutral'
}

function toneArrow(tone: InsightTone): string {
  if (tone === 'bullish') {
    return '▲'
  }
  if (tone === 'bearish') {
    return '▼'
  }
  return '■'
}

function scoreToTone(score: number | null): InsightTone {
  if (!isFiniteNumber(score)) {
    return 'neutral'
  }
  if (score >= 65) {
    return 'bullish'
  }
  if (score >= 45) {
    return 'neutral'
  }
  return 'bearish'
}

function resolveRsiStatusLabel(contextLabel: string): string {
  const value = contextLabel.toLowerCase()
  if (value.includes('oversold')) {
    return 'Oversold'
  }
  if (value.includes('overbought')) {
    return 'Overbought'
  }
  if (value.includes('neutral')) {
    return 'Neutral'
  }
  if (value.includes('unavailable')) {
    return 'Not available'
  }
  return contextLabel
}

function resolveAveragePositionStatus(
  movingAverage: number | null,
  currentPrice: number | null,
): { label: string; tone: InsightTone } {
  if (!isFiniteNumber(movingAverage) || !isFiniteNumber(currentPrice)) {
    return { label: 'Not available', tone: 'neutral' }
  }

  const deltaPercent = ((currentPrice - movingAverage) / movingAverage) * 100
  if (Math.abs(deltaPercent) <= 0.4) {
    return { label: 'Near Price', tone: 'neutral' }
  }

  if (currentPrice > movingAverage) {
    return { label: 'Below Price', tone: 'bullish' }
  }
  return { label: 'Above Price', tone: 'bearish' }
}

function formatSignedNumber(value: number): string {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${decimalFormatter.format(value)}`
}

function resolveTrendBias(trend?: string, signal?: string): InsightTone {
  const combined = `${trend ?? ''} ${signal ?? ''}`.toLowerCase()
  const bullishTokens = ['bull', 'buy', 'uptrend', 'upward', 'positive']
  const bearishTokens = ['bear', 'sell', 'downtrend', 'downward', 'negative']
  const hasBullish = bullishTokens.some((token) => combined.includes(token))
  const hasBearish = bearishTokens.some((token) => combined.includes(token))

  if (hasBullish && !hasBearish) {
    return 'bullish'
  }
  if (hasBearish && !hasBullish) {
    return 'bearish'
  }
  return 'neutral'
}

function resolveRsiInsightWidget(rawRsi: number | null | undefined): InsightWidgetState {
  if (!isFiniteNumber(rawRsi)) {
    return {
      tone: 'neutral',
      valueText: 'N/A',
      contextLabel: 'RSI unavailable',
      percent: 50,
      numericValue: null,
    }
  }

  if (rawRsi < 30) {
    return {
      tone: 'bullish',
      valueText: decimalFormatter.format(rawRsi),
      contextLabel: 'Oversold zone (<30)',
      percent: clampPercent(rawRsi),
      numericValue: rawRsi,
    }
  }
  if (rawRsi > 70) {
    return {
      tone: 'bearish',
      valueText: decimalFormatter.format(rawRsi),
      contextLabel: 'Overbought zone (>70)',
      percent: clampPercent(rawRsi),
      numericValue: rawRsi,
    }
  }
  return {
    tone: 'neutral',
    valueText: decimalFormatter.format(rawRsi),
    contextLabel: 'Neutral range (30-70)',
    percent: clampPercent(rawRsi),
    numericValue: rawRsi,
  }
}

function resolveMacdInsightWidget(
  rawMacd: number | undefined,
  rawSignal: number | undefined,
): InsightWidgetState {
  const macd = isFiniteNumber(rawMacd) ? rawMacd : null
  const signal = isFiniteNumber(rawSignal) ? rawSignal : null
  const reference = signal ?? macd

  if (reference === null) {
    return {
      tone: 'neutral',
      valueText: 'N/A',
      contextLabel: 'Signal unavailable',
      percent: 50,
      numericValue: null,
    }
  }

  const delta = macd !== null && signal !== null ? macd - signal : reference
  const threshold = 0.05
  let tone: InsightTone = 'neutral'
  if (delta > threshold) {
    tone = 'bullish'
  } else if (delta < -threshold) {
    tone = 'bearish'
  }

  return {
    tone,
    valueText: formatSignedNumber(reference),
    contextLabel:
      macd !== null && signal !== null
        ? `MACD ${formatSignedNumber(macd)} vs Signal ${formatSignedNumber(signal)}`
        : 'Using available MACD signal',
    percent: clampPercent(50 + delta * 35),
    numericValue: reference,
  }
}

function resolveAdxInsightWidget(
  rawAdx: number | undefined,
  trendBias: InsightTone,
): InsightWidgetState {
  if (!isFiniteNumber(rawAdx)) {
    return {
      tone: 'neutral',
      valueText: 'N/A',
      contextLabel: 'Trend strength unavailable',
      percent: 50,
      numericValue: null,
    }
  }

  const strengthLabel =
    rawAdx < 20 ? 'Weak trend (<20)' : rawAdx <= 40 ? 'Moderate trend (20-40)' : 'Strong trend (>40)'

  return {
    tone: rawAdx > 20 ? trendBias : 'neutral',
    valueText: decimalFormatter.format(rawAdx),
    contextLabel: strengthLabel,
    percent: clampPercent((rawAdx / 60) * 100),
    numericValue: rawAdx,
  }
}

function resolveMomentumSignalLabel(
  signal: string | undefined,
  trend: string | undefined,
  score: number,
): { label: 'Strong Bullish' | 'Bullish' | 'Neutral' | 'Bearish'; tone: InsightTone } {
  const combined = `${signal ?? ''} ${trend ?? ''}`.toLowerCase()
  if (combined.includes('strong bullish')) {
    return { label: 'Strong Bullish', tone: 'bullish' }
  }
  if (combined.includes('bull')) {
    return { label: 'Bullish', tone: 'bullish' }
  }
  if (combined.includes('bear')) {
    return { label: 'Bearish', tone: 'bearish' }
  }
  if (score >= 70) {
    return { label: 'Strong Bullish', tone: 'bullish' }
  }
  if (score >= 55) {
    return { label: 'Bullish', tone: 'bullish' }
  }
  if (score < 40) {
    return { label: 'Bearish', tone: 'bearish' }
  }
  return { label: 'Neutral', tone: 'neutral' }
}

function resolveMomentumInsightWidget(input: {
  trend?: string
  signal?: string
  score: number
  close: number | null
  sma20: number | null
  sma50: number | null
  rsi: number | null
  macdTone: InsightTone
}): {
  tone: InsightTone
  valueText: string
  signalLabel: 'Strong Bullish' | 'Bullish' | 'Neutral' | 'Bearish'
  percent: number
} {
  let strengthScore = clampPercent(input.score)

  if (isFiniteNumber(input.close) && isFiniteNumber(input.sma20)) {
    strengthScore += input.close >= input.sma20 ? 8 : -8
  }
  if (isFiniteNumber(input.close) && isFiniteNumber(input.sma50)) {
    strengthScore += input.close >= input.sma50 ? 8 : -8
  }
  if (isFiniteNumber(input.rsi)) {
    if (input.rsi >= 55 && input.rsi <= 70) {
      strengthScore += 6
    } else if (input.rsi < 45) {
      strengthScore -= 6
    }
  }
  if (input.macdTone === 'bullish') {
    strengthScore += 8
  } else if (input.macdTone === 'bearish') {
    strengthScore -= 8
  }

  strengthScore = clampPercent(strengthScore)

  const signalState = resolveMomentumSignalLabel(
    input.signal,
    input.trend,
    strengthScore,
  )

  return {
    tone: signalState.tone,
    valueText: decimalFormatter.format(strengthScore),
    signalLabel: signalState.label,
    percent: strengthScore,
  }
}

type PriceLadderRow = {
  key: string
  label: string
  value: number | null
  kind: PriceLadderKind
  distanceLabel: string
}

type PriceRangeMarker = {
  key: string
  label: string
  kind: PriceLadderKind
  value: number
  position: number
  anchor: 'left' | 'center' | 'right'
  distanceLabel: string
}

type PriceRangeBand = {
  left: number
  width: number
}

function uniqueSortedLevels(levels: number[] | undefined): number[] {
  if (!Array.isArray(levels)) {
    return []
  }

  const unique = new Set<number>()
  for (const level of levels) {
    if (isFiniteNumber(level)) {
      unique.add(level)
    }
  }
  return Array.from(unique).sort((a, b) => a - b)
}

function pickResistanceLevels(
  levels: number[],
  currentPrice: number | null,
): [number | null, number | null] {
  const preferred =
    currentPrice !== null ? levels.filter((level) => level >= currentPrice) : levels
  const selected: number[] = preferred.slice(0, 2)

  if (selected.length < 2) {
    for (const level of levels) {
      if (selected.includes(level)) {
        continue
      }
      selected.push(level)
      if (selected.length === 2) {
        break
      }
    }
  }

  selected.sort((a, b) => a - b)
  return [selected[0] ?? null, selected[1] ?? null]
}

function pickSupportLevels(
  levels: number[],
  currentPrice: number | null,
): [number | null, number | null] {
  const descending = [...levels].sort((a, b) => b - a)
  const preferred =
    currentPrice !== null
      ? descending.filter((level) => level <= currentPrice)
      : descending
  const selected: number[] = preferred.slice(0, 2)

  if (selected.length < 2) {
    for (const level of descending) {
      if (selected.includes(level)) {
        continue
      }
      selected.push(level)
      if (selected.length === 2) {
        break
      }
    }
  }

  selected.sort((a, b) => b - a)
  return [selected[0] ?? null, selected[1] ?? null]
}

function levelDistanceLabel(
  kind: PriceLadderKind,
  level: number | null,
  currentPrice: number | null,
): string {
  if (kind === 'current') {
    return '0.0% from current'
  }
  if (!isFiniteNumber(level) || !isFiniteNumber(currentPrice) || currentPrice === 0) {
    return ''
  }

  const absoluteMove = Math.abs(((level - currentPrice) / currentPrice) * 100)
  const sign = kind === 'resistance' ? '+' : '-'
  return `${sign}${absoluteMove.toFixed(1)}% from current`
}

function buildPriceLadderRows(input: {
  currentPrice: number | null
  supports: number[] | undefined
  resistances: number[] | undefined
}): PriceLadderRow[] {
  const resistanceLevels = uniqueSortedLevels(input.resistances)
  const supportLevels = uniqueSortedLevels(input.supports)
  const [resistance1, resistance2] = pickResistanceLevels(
    resistanceLevels,
    input.currentPrice,
  )
  const [support1, support2] = pickSupportLevels(supportLevels, input.currentPrice)

  return [
    {
      key: 'resistance-2',
      label: 'Resistance 2',
      value: resistance2,
      kind: 'resistance',
      distanceLabel: levelDistanceLabel('resistance', resistance2, input.currentPrice),
    },
    {
      key: 'resistance-1',
      label: 'Resistance 1',
      value: resistance1,
      kind: 'resistance',
      distanceLabel: levelDistanceLabel('resistance', resistance1, input.currentPrice),
    },
    {
      key: 'current-price',
      label: 'Current Price',
      value: input.currentPrice,
      kind: 'current',
      distanceLabel: levelDistanceLabel('current', input.currentPrice, input.currentPrice),
    },
    {
      key: 'support-1',
      label: 'Support 1',
      value: support1,
      kind: 'support',
      distanceLabel: levelDistanceLabel('support', support1, input.currentPrice),
    },
    {
      key: 'support-2',
      label: 'Support 2',
      value: support2,
      kind: 'support',
      distanceLabel: levelDistanceLabel('support', support2, input.currentPrice),
    },
  ]
}

function buildPriceRangeMarkers(rows: PriceLadderRow[]): PriceRangeMarker[] {
  const numericRows = rows.filter(
    (row): row is PriceLadderRow & { value: number } => isFiniteNumber(row.value),
  )
  if (numericRows.length === 0) {
    return []
  }

  const min = Math.min(...numericRows.map((row) => row.value))
  const max = Math.max(...numericRows.map((row) => row.value))
  const edgePaddingPercent = 7
  const usableRangePercent = 100 - edgePaddingPercent * 2

  const sorted = [...numericRows].sort((a, b) => a.value - b.value)
  return sorted.map((row) => {
    const normalized =
      max === min
        ? 0.5
        : clampPercent(((row.value - min) / (max - min)) * 100) / 100
    const position = edgePaddingPercent + normalized * usableRangePercent
    const anchor: PriceRangeMarker['anchor'] =
      position <= edgePaddingPercent + 0.5
        ? 'left'
        : position >= 100 - edgePaddingPercent - 0.5
          ? 'right'
          : 'center'

    return {
      key: row.key,
      label: row.label,
      kind: row.kind,
      value: row.value,
      position,
      anchor,
      distanceLabel: row.distanceLabel,
    }
  })
}

function buildPriceRangeBand(
  start: number | null | undefined,
  end: number | null | undefined,
): PriceRangeBand | null {
  if (!isFiniteNumber(start) || !isFiniteNumber(end)) {
    return null
  }
  const left = Math.min(start, end)
  const width = Math.abs(end - start)
  if (width <= 0.2) {
    return null
  }
  return { left, width }
}

function resolvePriceMarkerTooltipDistance(marker: PriceRangeMarker): string {
  if (marker.kind === 'current') {
    return 'At current market price'
  }

  const match = marker.distanceLabel.match(/([+-]?\d+(?:\.\d+)?)%/)
  if (!match) {
    return 'Distance unavailable'
  }

  const distance = Math.abs(Number.parseFloat(match[1])).toFixed(1)
  if (marker.kind === 'support') {
    return `${distance}% below current price`
  }
  if (marker.kind === 'resistance') {
    return `${distance}% above current price`
  }
  return `${distance}% from current price`
}

type MovingAverageAlignment = {
  label: 'Strong Bullish Alignment' | 'Bearish Alignment' | 'Mixed Trend Structure' | 'Neutral Alignment'
  tone: InsightTone
}

function resolveMovingAverageAlignment(input: {
  price: number | null
  sma20: number | null
  sma50: number | null
  sma200: number | null
}): MovingAverageAlignment {
  const { price, sma20, sma50, sma200 } = input

  if (
    isFiniteNumber(price) &&
    isFiniteNumber(sma20) &&
    isFiniteNumber(sma50) &&
    isFiniteNumber(sma200)
  ) {
    if (price > sma20 && sma20 > sma50 && sma50 > sma200) {
      return { label: 'Strong Bullish Alignment', tone: 'bullish' }
    }
    if (price < sma20 && sma20 < sma50 && sma50 < sma200) {
      return { label: 'Bearish Alignment', tone: 'bearish' }
    }
    return { label: 'Mixed Trend Structure', tone: 'neutral' }
  }

  return { label: 'Neutral Alignment', tone: 'neutral' }
}

type VolumeSnapshot = {
  chartData: Array<{ label: string; volume: number }>
  averageVolume: number | null
  currentVolume: number | null
  trend: 'Rising' | 'Stable' | 'Falling'
  trendTone: InsightTone
  recentCloses: number[]
}

type RiskLevel = 'low' | 'moderate' | 'high' | 'unknown'

type RiskMetric = {
  label: string
  value: string
  level: RiskLevel
}

type IndicatorMiniSeriesPoint = {
  index: number
  value: number
  label: string
  timestampLabel: string
}

type IndicatorMiniChart = {
  key: 'rsi' | 'macd-hist' | 'adx' | 'volume'
  title: string
  type: 'line' | 'histogram'
  series: IndicatorMiniSeriesPoint[]
  currentValueLabel: string
  stroke: string
}

function averageNumbers(values: number[]): number | null {
  if (values.length === 0) {
    return null
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function formatVolumeDateLabel(value: string, fallbackIndex: number): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return `${fallbackIndex + 1}`
  }
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatMiniPointTimestamp(value: string, fallbackIndex: number): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return `Point ${fallbackIndex + 1}`
  }
  return parsed.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function resolveVolumeTrend(volumes: number[]): {
  trend: 'Rising' | 'Stable' | 'Falling'
  tone: InsightTone
} {
  if (volumes.length < 6) {
    return { trend: 'Stable', tone: 'neutral' }
  }

  const splitIndex = Math.floor(volumes.length / 2)
  const firstHalfAverage = averageNumbers(volumes.slice(0, splitIndex))
  const secondHalfAverage = averageNumbers(volumes.slice(splitIndex))

  if (
    !isFiniteNumber(firstHalfAverage) ||
    !isFiniteNumber(secondHalfAverage) ||
    firstHalfAverage === 0
  ) {
    return { trend: 'Stable', tone: 'neutral' }
  }

  const changeRatio = (secondHalfAverage - firstHalfAverage) / firstHalfAverage
  if (changeRatio > 0.08) {
    return { trend: 'Rising', tone: 'bullish' }
  }
  if (changeRatio < -0.08) {
    return { trend: 'Falling', tone: 'bearish' }
  }
  return { trend: 'Stable', tone: 'neutral' }
}

function buildVolumeSnapshot(ohlcv: OhlcvPoint[]): VolumeSnapshot {
  const recentRows = ohlcv
    .filter(
      (row) =>
        isFiniteNumber(row.volume) &&
        row.volume >= 0 &&
        isFiniteNumber(row.close),
    )
    .slice(-30)

  const chartData = recentRows.map((row, index) => ({
    label: formatVolumeDateLabel(row.date, index),
    volume: row.volume,
  }))
  const volumes = recentRows.map((row) => row.volume)
  const recentCloses = recentRows.map((row) => row.close)
  const trendState = resolveVolumeTrend(volumes)

  return {
    chartData,
    averageVolume: averageNumbers(volumes),
    currentVolume: volumes.length > 0 ? volumes[volumes.length - 1] : null,
    trend: trendState.trend,
    trendTone: trendState.tone,
    recentCloses,
  }
}

function computeRsiSeries(closes: number[], period = 14): Array<number | null> {
  const output: Array<number | null> = Array(closes.length).fill(null)
  if (closes.length <= period) {
    return output
  }

  let gainSum = 0
  let lossSum = 0
  for (let index = 1; index <= period; index += 1) {
    const delta = closes[index] - closes[index - 1]
    if (delta > 0) {
      gainSum += delta
    } else {
      lossSum += Math.abs(delta)
    }
  }

  let averageGain = gainSum / period
  let averageLoss = lossSum / period
  output[period] =
    averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss)

  for (let index = period + 1; index < closes.length; index += 1) {
    const delta = closes[index] - closes[index - 1]
    const gain = delta > 0 ? delta : 0
    const loss = delta < 0 ? Math.abs(delta) : 0
    averageGain = (averageGain * (period - 1) + gain) / period
    averageLoss = (averageLoss * (period - 1) + loss) / period
    output[index] =
      averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss)
  }

  return output
}

function computeEmaSeries(values: number[], period: number): number[] {
  if (values.length === 0) {
    return []
  }

  const alpha = 2 / (period + 1)
  const result: number[] = [values[0]]
  for (let index = 1; index < values.length; index += 1) {
    const previous = result[index - 1]
    result.push(alpha * values[index] + (1 - alpha) * previous)
  }
  return result
}

function computeMacdHistogramSeries(closes: number[]): number[] {
  if (closes.length === 0) {
    return []
  }
  const ema12 = computeEmaSeries(closes, 12)
  const ema26 = computeEmaSeries(closes, 26)
  const macdLine = closes.map((_, index) => ema12[index] - ema26[index])
  const signalLine = computeEmaSeries(macdLine, 9)
  return macdLine.map((value, index) => value - signalLine[index])
}

function computeAdxSeries(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): Array<number | null> {
  const length = Math.min(highs.length, lows.length, closes.length)
  const output: Array<number | null> = Array(length).fill(null)
  if (length <= period + 1) {
    return output
  }

  const tr: number[] = Array(length).fill(0)
  const plusDm: number[] = Array(length).fill(0)
  const minusDm: number[] = Array(length).fill(0)

  for (let index = 1; index < length; index += 1) {
    const upMove = highs[index] - highs[index - 1]
    const downMove = lows[index - 1] - lows[index]
    plusDm[index] = upMove > downMove && upMove > 0 ? upMove : 0
    minusDm[index] = downMove > upMove && downMove > 0 ? downMove : 0
    tr[index] = Math.max(
      highs[index] - lows[index],
      Math.abs(highs[index] - closes[index - 1]),
      Math.abs(lows[index] - closes[index - 1]),
    )
  }

  let trSmooth = 0
  let plusSmooth = 0
  let minusSmooth = 0
  for (let index = 1; index <= period; index += 1) {
    trSmooth += tr[index]
    plusSmooth += plusDm[index]
    minusSmooth += minusDm[index]
  }

  const dxValues: Array<number | null> = Array(length).fill(null)
  for (let index = period; index < length; index += 1) {
    if (index > period) {
      trSmooth = trSmooth - trSmooth / period + tr[index]
      plusSmooth = plusSmooth - plusSmooth / period + plusDm[index]
      minusSmooth = minusSmooth - minusSmooth / period + minusDm[index]
    }
    if (trSmooth <= 0) {
      continue
    }
    const plusDi = (100 * plusSmooth) / trSmooth
    const minusDi = (100 * minusSmooth) / trSmooth
    const denominator = plusDi + minusDi
    if (denominator <= 0) {
      continue
    }
    dxValues[index] = (100 * Math.abs(plusDi - minusDi)) / denominator
  }

  let previousAdx: number | null = null
  for (let index = period; index < length; index += 1) {
    const dx = dxValues[index]
    if (!isFiniteNumber(dx)) {
      continue
    }
    if (!isFiniteNumber(previousAdx)) {
      previousAdx = dx
    } else {
      previousAdx = ((previousAdx * (period - 1)) + dx) / period
    }
    output[index] = previousAdx
  }

  return output
}

function toMiniSeries(
  values: Array<number | null>,
  rows: OhlcvPoint[],
): IndicatorMiniSeriesPoint[] {
  const points: IndicatorMiniSeriesPoint[] = []
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (isFiniteNumber(value)) {
      const row = rows[index]
      points.push({
        index,
        value,
        label: row ? formatVolumeDateLabel(row.date, index) : `${index + 1}`,
        timestampLabel: row
          ? formatMiniPointTimestamp(row.date, index)
          : `Point ${index + 1}`,
      })
    }
  }
  return points
}

function lastMiniValue(values: Array<number | null>): number | null {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index]
    if (isFiniteNumber(value)) {
      return value
    }
  }
  return null
}

function formatMiniIndicatorValue(
  key: IndicatorMiniChart['key'],
  value: number | null,
): string {
  if (!isFiniteNumber(value)) {
    return 'N/A'
  }
  if (key === 'volume') {
    return compactFormatter.format(value)
  }
  if (key === 'macd-hist') {
    return formatSignedNumber(Number(value.toFixed(2)))
  }
  return value.toFixed(1)
}

function formatMiniTooltipValue(
  key: IndicatorMiniChart['key'],
  value: number,
): string {
  if (key === 'volume') {
    return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
  }
  if (key === 'macd-hist') {
    return formatSignedNumber(Number(value.toFixed(4)))
  }
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function buildIndicatorMiniCharts(ohlcv: OhlcvPoint[]): IndicatorMiniChart[] {
  const recentRows = ohlcv
    .filter(
      (row) =>
        isFiniteNumber(row.close) &&
        isFiniteNumber(row.high) &&
        isFiniteNumber(row.low) &&
        isFiniteNumber(row.volume),
    )
    .slice(-30)

  const closes = recentRows.map((row) => row.close)
  const highs = recentRows.map((row) => row.high)
  const lows = recentRows.map((row) => row.low)
  const volumes = recentRows.map((row) => row.volume)

  const rsiValues = computeRsiSeries(closes, 14)
  const macdHistogramValues = computeMacdHistogramSeries(closes).map((value) =>
    isFiniteNumber(value) ? value : null,
  )
  const adxValues = computeAdxSeries(highs, lows, closes, 14)
  const volumeValues = volumes.map((value) => (isFiniteNumber(value) ? value : null))

  const charts: IndicatorMiniChart[] = [
    {
      key: 'rsi',
      title: 'RSI Trend',
      type: 'line',
      series: toMiniSeries(rsiValues, recentRows),
      currentValueLabel: formatMiniIndicatorValue('rsi', lastMiniValue(rsiValues)),
      stroke: '#2563eb',
    },
    {
      key: 'macd-hist',
      title: 'MACD Histogram',
      type: 'histogram',
      series: toMiniSeries(macdHistogramValues, recentRows),
      currentValueLabel: formatMiniIndicatorValue(
        'macd-hist',
        lastMiniValue(macdHistogramValues),
      ),
      stroke: '#0f766e',
    },
    {
      key: 'adx',
      title: 'ADX Trend',
      type: 'line',
      series: toMiniSeries(adxValues, recentRows),
      currentValueLabel: formatMiniIndicatorValue('adx', lastMiniValue(adxValues)),
      stroke: '#d97706',
    },
    {
      key: 'volume',
      title: 'Volume Trend',
      type: 'line',
      series: toMiniSeries(volumeValues, recentRows),
      currentValueLabel: formatMiniIndicatorValue('volume', lastMiniValue(volumeValues)),
      stroke: '#0f766e',
    },
  ]

  return charts
}

function riskLevelLabel(level: RiskLevel): string {
  if (level === 'low') {
    return 'Low Risk'
  }
  if (level === 'moderate') {
    return 'Moderate'
  }
  if (level === 'high') {
    return 'High Risk'
  }
  return 'Not available'
}

function riskLevelToTone(level: RiskLevel): InsightTone {
  if (level === 'low') {
    return 'bullish'
  }
  if (level === 'high') {
    return 'bearish'
  }
  return 'neutral'
}

function classifyVolatilityRisk(volatility: number | null): RiskLevel {
  if (!isFiniteNumber(volatility)) {
    return 'unknown'
  }
  if (volatility < 20) {
    return 'low'
  }
  if (volatility <= 35) {
    return 'moderate'
  }
  return 'high'
}

function classifyBetaRisk(beta: number | null): RiskLevel {
  if (!isFiniteNumber(beta)) {
    return 'unknown'
  }
  const absoluteBeta = Math.abs(beta)
  if (absoluteBeta < 1) {
    return 'low'
  }
  if (absoluteBeta <= 1.5) {
    return 'moderate'
  }
  return 'high'
}

function classifyDrawdownRisk(maxDrawdown: number | null): RiskLevel {
  if (!isFiniteNumber(maxDrawdown)) {
    return 'unknown'
  }
  const absolute = Math.abs(maxDrawdown)
  if (absolute < 10) {
    return 'low'
  }
  if (absolute <= 20) {
    return 'moderate'
  }
  return 'high'
}

function classifyDistanceRisk(distancePercent: number | null): RiskLevel {
  if (!isFiniteNumber(distancePercent)) {
    return 'unknown'
  }
  if (distancePercent <= 2) {
    return 'high'
  }
  if (distancePercent <= 5) {
    return 'moderate'
  }
  return 'low'
}

function computeVolatility30(recentCloses: number[]): number | null {
  if (recentCloses.length < 2) {
    return null
  }

  const returns: number[] = []
  for (let index = 1; index < recentCloses.length; index += 1) {
    const previous = recentCloses[index - 1]
    const current = recentCloses[index]
    if (!isFiniteNumber(previous) || !isFiniteNumber(current) || previous === 0) {
      continue
    }
    returns.push((current - previous) / previous)
  }

  if (returns.length < 2) {
    return null
  }

  const meanReturn = returns.reduce((sum, value) => sum + value, 0) / returns.length
  const variance =
    returns.reduce((sum, value) => sum + (value - meanReturn) ** 2, 0) /
    (returns.length - 1)
  const dailyStd = Math.sqrt(variance)
  return dailyStd * Math.sqrt(252) * 100
}

function computeMaxDrawdown(recentCloses: number[]): number | null {
  if (recentCloses.length === 0) {
    return null
  }

  let peak: number | null = null
  let maxDrawdown = 0

  for (const close of recentCloses) {
    if (!isFiniteNumber(close)) {
      continue
    }
    if (peak === null || close > peak) {
      peak = close
    }
    if (!isFiniteNumber(peak) || peak === 0) {
      continue
    }
    const drawdown = ((close - peak) / peak) * 100
    if (drawdown < maxDrawdown) {
      maxDrawdown = drawdown
    }
  }

  return maxDrawdown
}

function computeDistancePercent(base: number | null, level: number | null): number | null {
  if (!isFiniteNumber(base) || !isFiniteNumber(level) || base === 0) {
    return null
  }
  return Math.abs(((level - base) / base) * 100)
}

function formatRiskMetricValue(value: number | null, suffix = ''): string {
  if (!isFiniteNumber(value)) {
    return 'N/A'
  }
  return `${value.toFixed(1)}${suffix}`
}

function buildRiskMetrics(input: {
  recentCloses: number[]
  beta: number | null
  currentPrice: number | null
  nearestSupport: number | null
  nearestResistance: number | null
}): RiskMetric[] {
  const volatility = computeVolatility30(input.recentCloses)
  const maxDrawdown = computeMaxDrawdown(input.recentCloses)
  const distanceToSupport = computeDistancePercent(
    input.currentPrice,
    input.nearestSupport,
  )
  const distanceToResistance = computeDistancePercent(
    input.currentPrice,
    input.nearestResistance,
  )

  return [
    {
      label: 'Volatility (30 day)',
      value: formatRiskMetricValue(volatility, '%'),
      level: classifyVolatilityRisk(volatility),
    },
    {
      label: 'Beta',
      value: isFiniteNumber(input.beta) ? input.beta.toFixed(2) : 'N/A',
      level: classifyBetaRisk(input.beta),
    },
    {
      label: 'Max Drawdown',
      value: formatRiskMetricValue(maxDrawdown, '%'),
      level: classifyDrawdownRisk(maxDrawdown),
    },
    {
      label: 'Distance to Support',
      value: formatRiskMetricValue(distanceToSupport, '%'),
      level: classifyDistanceRisk(distanceToSupport),
    },
    {
      label: 'Distance to Resistance',
      value: formatRiskMetricValue(distanceToResistance, '%'),
      level: classifyDistanceRisk(distanceToResistance),
    },
  ]
}

function formatHeadlineTimestamp(value: string | undefined): string {
  if (!value) {
    return 'Unknown time'
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }
  return parsed.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

function resolveHeadlineTimestamp(headline: SentimentHeadline): string | undefined {
  if (headline.publishedAt) {
    return headline.publishedAt
  }
  if (headline.published_at) {
    return headline.published_at
  }
  if (headline.pubDate) {
    return headline.pubDate
  }
  if (headline.dateTimePub) {
    return headline.dateTimePub
  }
  if (headline.dateTime) {
    return headline.dateTime
  }
  if (headline.date && headline.time) {
    return `${headline.date}T${headline.time}Z`
  }
  if (headline.date) {
    return headline.date
  }
  return undefined
}


function summarizeScore(
  score: number,
  mode: 'fundamental' | 'sentiment',
): string {
  if (mode === 'fundamental') {
    if (score >= 70) {
      return 'Balance sheet strength, profitability, and valuation metrics indicate a strong fundamental setup.'
    }
    if (score >= 45) {
      return 'Core fundamentals are mixed. Some health metrics are solid, while others need confirmation.'
    }
    return 'Fundamental profile is weak relative to preferred thresholds for valuation, growth, or financial health.'
  }

  if (score >= 70) {
    return 'Headline flow is largely constructive with a positive skew across recent coverage.'
  }
  if (score >= 45) {
    return 'News tone is balanced overall, without a dominant positive or negative signal.'
  }
  return 'Recent news flow is skewed negative and may weigh on near-term sentiment.'
}

function extractBulletPoints(raw: string): string[] {
  const text = raw.replace(/\r\n/g, '\n').replace(/\\n/g, '\n').trim()
  if (!text) {
    return []
  }

  // Strict bullet boundary: only ". -" and line-start "- ".
  const normalizedText = text.replace(/\. (?=-\s+\S)/g, '.\n')
  const firstMarkerPattern = /(^|\n)-\s+\S/m
  const firstMarkerMatch = firstMarkerPattern.exec(normalizedText)
  const leadingText = firstMarkerMatch
    ? normalizedText
        .slice(0, firstMarkerMatch.index + (firstMarkerMatch[1]?.length ?? 0))
        .trim()
    : ''

  const lineBulletPattern = /^-\s+(.+)$/
  const bulletsFromLines: string[] = []
  let current = ''

  for (const rawLine of normalizedText.split('\n')) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }
    const bulletMatch = line.match(lineBulletPattern)
    if (bulletMatch) {
      if (current) {
        bulletsFromLines.push(current)
      }
      current = bulletMatch[1].trim()
      continue
    }
    if (current) {
      current = `${current} ${line}`.trim()
    }
  }

  if (current) {
    bulletsFromLines.push(current)
  }

  if (bulletsFromLines.length > 0) {
    if (leadingText) {
      return [leadingText, ...bulletsFromLines]
    }
    return bulletsFromLines
  }

  const flattened = normalizedText.replace(/\s+/g, ' ').trim()
  if (!flattened.includes('. - ')) {
    return []
  }
  const segments = flattened
    .split(/\. -\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean)

  if (segments.length <= 1) {
    return []
  }

  return segments
}

function parseSentimentSummary(raw: string): { insights: string[]; summary: string } {
  const text = raw.replace(/\r\n/g, '\n').replace(/\\n/g, '\n').trim()
  if (!text) {
    return { insights: [], summary: '' }
  }

  const summaryLabelPattern =
    /(?:\*\*\s*)?\bsummary\b(?:\s*[:\-]\s*)?(?:\s*\*\*)?\s*[:\-]?\s*/i
  const summaryLabelMatch = summaryLabelPattern.exec(text)
  let insightsPart = text
  let summaryPart = ''
  if (summaryLabelMatch && typeof summaryLabelMatch.index === 'number') {
    insightsPart = text.slice(0, summaryLabelMatch.index).trim()
    summaryPart = text
      .slice(summaryLabelMatch.index + summaryLabelMatch[0].length)
      .trim()
  }

  const insights = extractBulletPoints(insightsPart)

  const summary = summaryPart.trim()

  if (insights.length === 0 && !summary) {
    return { insights: [], summary: text }
  }

  return { insights, summary }
}

function resolveTechnicalData(
  result: TechnicalResult,
  selectedPeriod: string,
): TechnicalData {
  const legacy = result.data
  const indicators = result.indicators

  return {
    symbol: legacy?.symbol ?? result.symbol ?? '',
    period: legacy?.period ?? selectedPeriod,
    ohlcv: legacy?.ohlcv ?? result.ohlcv ?? [],
    lastClose: legacy?.lastClose ?? indicators?.close ?? null,
    sma20: legacy?.sma20 ?? indicators?.SMA20 ?? null,
    sma50: legacy?.sma50 ?? indicators?.SMA50 ?? null,
    rsi: legacy?.rsi ?? indicators?.RSI ?? null,
    ['52WeekLow']: legacy?.['52WeekLow'] ?? indicators?.['52WeekLow'] ?? null,
    ['52WeekHigh']:
      legacy?.['52WeekHigh'] ?? indicators?.['52WeekHigh'] ?? null,
  }
}

function describeTechnicalSignal(result: TechnicalResult): string {
  const parts: string[] = []
  if (result.trend) {
    parts.push(`Trend: ${result.trend}.`)
  }
  if (result.signal) {
    parts.push(`Signal: ${result.signal}.`)
  }
  if (result.reasons && result.reasons.length > 0) {
    parts.push(`Drivers: ${result.reasons.slice(0, 3).join(', ')}.`)
  }
  return parts.join(' ')
}

function describeTrend(data: TechnicalData): string {
  const close = data.lastClose
  const sma20 = data.sma20
  const sma50 = data.sma50
  const rsi = data.rsi

  const trendParts: string[] = []
  if (
    typeof close === 'number' &&
    typeof sma20 === 'number' &&
    typeof sma50 === 'number'
  ) {
    if (close > sma20 && close > sma50) {
      trendParts.push('Price is above both SMA20 and SMA50, suggesting upward trend support.')
    } else if (close < sma20 && close < sma50) {
      trendParts.push('Price is below SMA20 and SMA50, indicating weaker trend structure.')
    } else {
      trendParts.push('Price is between moving averages, showing mixed momentum.')
    }
  }

  if (typeof rsi === 'number') {
    if (rsi > 70) {
      trendParts.push('RSI is elevated, which can indicate overbought conditions.')
    } else if (rsi < 30) {
      trendParts.push('RSI is low, which can indicate oversold conditions.')
    } else {
      trendParts.push('RSI is in a balanced range.')
    }
  }

  if (trendParts.length === 0) {
    return 'Technical indicator coverage is limited for this ticker.'
  }

  return trendParts.join(' ')
}

export default App

