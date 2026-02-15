import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import { fetchAnalysis } from './api'
import type {
  AnalysisResponse,
  FundamentalData,
  ReportSections,
  SentimentHeadline,
  TechnicalData,
} from './types'

const PERIOD_OPTIONS = [
  { label: '1M', value: '1mo' },
  { label: '3M', value: '3mo' },
  { label: '6M', value: '6mo' },
  { label: '1Y', value: '1y' },
  { label: '2Y', value: '2y' },
  { label: '5Y', value: '5y' },
]

type AnalysisTab = 'overview' | 'fundamental' | 'technical' | 'sentiment'

const ANALYSIS_TABS: Array<{ key: AnalysisTab; label: string }> = [
  { key: 'overview', label: 'Overall' },
  { key: 'fundamental', label: 'Fundamental' },
  { key: 'technical', label: 'Technical' },
  { key: 'sentiment', label: 'Sentiment' },
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
  const { pathname, navigate } = usePathRouter()
  const route = useMemo(() => parseRoute(pathname), [pathname])
  const activeTicker = route.type === 'stock' ? route.ticker : null

  const handleSearch = useCallback(
    (input: string) => {
      const ticker = normalizeTicker(input)
      if (!ticker) {
        return
      }
      navigate(`/stock/${encodeURIComponent(ticker)}/overview`)
    },
    [navigate],
  )

  const goHome = useCallback(() => {
    navigate('/')
  }, [navigate])

  return (
    <div className="app-shell">
      <HeaderBar
        key={activeTicker ?? 'home'}
        initialSearch={activeTicker ?? ''}
        onSearch={handleSearch}
        onHome={goHome}
      />

      <main className="content">
        {route.type === 'stock' ? (
          <AnalysisPage
            key={route.ticker}
            ticker={route.ticker}
            tab={route.tab}
            onTabChange={(tab) =>
              navigate(`/stock/${encodeURIComponent(route.ticker)}/${tab}`)
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
  onSearch: (ticker: string) => void
  onHome: () => void
}

function HeaderBar({ initialSearch, onSearch, onHome }: HeaderBarProps) {
  const [searchValue, setSearchValue] = useState(initialSearch)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSearch(searchValue)
  }

  return (
    <header className="top-bar">
      <button className="brand" type="button" onClick={onHome}>
        StockInsight
      </button>
      <form className="top-search" onSubmit={handleSubmit}>
        <input
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder="Search ticker (AAPL, MSFT, NVDA)"
          aria-label="Search ticker symbol"
        />
        <button type="submit">Search</button>
      </form>
    </header>
  )
}

type HomePageProps = {
  onSearch: (ticker: string) => void
}

function HomePage({ onSearch }: HomePageProps) {
  const [tickerInput, setTickerInput] = useState('')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSearch(tickerInput)
  }

  return (
    <section className="hero">
      <div className="hero-copy">
        <p className="kicker">Live equity intelligence workspace</p>
        <h1>One screen to inspect how a stock scores across core signals.</h1>
        <p>
          Search any ticker to open structured analysis sections for overall,
          fundamental, technical, and sentiment views.
        </p>
        <div className="cta-row">
          <button type="button">Log In (Coming Soon)</button>
          <button type="button" className="secondary">
            Create Account (Coming Soon)
          </button>
        </div>
      </div>

      <div className="hero-panel">
        <h2>Start With A Ticker</h2>
        <form className="hero-search" onSubmit={handleSubmit}>
          <input
            value={tickerInput}
            onChange={(event) => setTickerInput(event.target.value)}
            placeholder="Enter ticker"
            aria-label="Ticker symbol input"
          />
          <button type="submit">Open Analysis</button>
        </form>
        <p>Examples: AAPL, TSLA, AMZN, JPM, META.</p>
      </div>
    </section>
  )
}

type AnalysisPageProps = {
  ticker: string
  tab: AnalysisTab
  onTabChange: (tab: AnalysisTab) => void
}

function AnalysisPage({ ticker, tab, onTabChange }: AnalysisPageProps) {
  const [period, setPeriod] = useState('1y')
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

      {!isLoading && !error && analysis && renderSection(tab, analysis)}
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

function FundamentalSection({ result, llmSummary }: FundamentalSectionProps) {
  if (!result) {
    return (
      <UnavailablePanel title="Fundamental Analysis">
        Fundamental data is currently unavailable for this ticker.
      </UnavailablePanel>
    )
  }

  const data: FundamentalData = result.data
  const currency = data.currency ?? 'USD'
  const summary = llmSummary?.trim() || summarizeScore(result.score, 'fundamental')

  return (
    <article className="panel reveal">
      <header className="panel-head">
        <h2>Fundamental Analysis</h2>
        <span className="score-tag">{formatScore(result.score)}</span>
      </header>
      <p className="analysis-copy">{summary}</p>
      <h3>Data used</h3>
      <MetricList
        rows={[
          ['Sector', safeText(data.sector)],
          ['Industry', safeText(data.industry)],
          ['Current price', formatCurrency(data.currentPrice, currency)],
          ['Market cap', formatCompact(data.marketCap)],
          ['P/E (trailing)', formatNumber(data.trailingPE)],
          ['P/E (forward)', formatNumber(data.forwardPE)],
          ['PEG ratio', formatNumber(data.pegRatio)],
          ['Price to book', formatNumber(data.priceToBook)],
          ['Return on equity', formatPercent(data.returnOnEquity)],
          ['Operating margin', formatPercent(data.operatingMargins)],
          ['Profit margin', formatPercent(data.profitMargins)],
          ['Debt to equity', formatNumber(data.debtToEquity)],
          ['Current ratio', formatNumber(data.currentRatio)],
          ['Revenue growth', formatPercent(data.revenueGrowth)],
          ['Earnings growth', formatPercent(data.earningsGrowth)],
          ['Dividend yield', formatPercent(data.dividendYield)],
          ['52W range', rangeValue(data['52WeekLow'], data['52WeekHigh'], currency)],
        ]}
      />
    </article>
  )
}

type TechnicalSectionProps = {
  result: AnalysisResponse['technical']
  llmSummary?: string
}

function TechnicalSection({ result, llmSummary }: TechnicalSectionProps) {
  if (!result) {
    return (
      <UnavailablePanel title="Technical Analysis">
        Technical price history is currently unavailable for this ticker.
      </UnavailablePanel>
    )
  }

  const data: TechnicalData = result.data
  const trendText = llmSummary?.trim() || describeTrend(data)
  const tradingViewSymbol = toTradingViewSymbol(data.symbol)
  const tradingViewInterval = tradingViewIntervalFromPeriod(data.period)
  const tradingViewUrl = buildTradingViewChartUrl(
    tradingViewSymbol,
    tradingViewInterval,
  )

  return (
    <article className="panel reveal">
      <header className="panel-head">
        <h2>Technical Analysis</h2>
        <span className="score-tag">{formatScore(result.score)}</span>
      </header>
      <p className="analysis-copy">{trendText}</p>
      <div className="technical-layout">
        <div className="tv-chart-wrap">
          <iframe
            title={`TradingView chart for ${tradingViewSymbol}`}
            src={tradingViewUrl}
            loading="lazy"
            allowFullScreen
          />
        </div>
        <aside className="technical-side">
          <h3>Data used</h3>
          <MetricList
            rows={[
              ['Last close', formatCurrency(data.lastClose, 'USD')],
              ['SMA20', formatCurrency(data.sma20, 'USD')],
              ['SMA50', formatCurrency(data.sma50, 'USD')],
              ['RSI (14)', formatNumber(data.rsi)],
              ['52W range', rangeValue(data['52WeekLow'], data['52WeekHigh'], 'USD')],
              ['Selected period', data.period],
            ]}
          />
        </aside>
      </div>
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

  const headlines: SentimentHeadline[] = result.headlines.slice(0, 12)
  const summary = llmSummary?.trim() || summarizeScore(result.score, 'sentiment')

  return (
    <article className="panel reveal">
      <header className="panel-head">
        <h2>Sentiment Analysis</h2>
        <span className="score-tag">{formatScore(result.score)}</span>
      </header>
      <p className="analysis-copy">{summary}</p>
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
            <div>
              {headline.link ? (
                <a href={headline.link} target="_blank" rel="noreferrer">
                  {headline.title}
                </a>
              ) : (
                <p>{headline.title}</p>
              )}
              <span>
                {safeText(headline.source)} | {headline.sentiment.toUpperCase()} |{' '}
                {headline.sentimentScore.toFixed(3)}
              </span>
            </div>
          </article>
        ))}
      </div>
    </article>
  )
}

function renderSection(tab: AnalysisTab, analysis: AnalysisResponse) {
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
          llmSummary={llmSections.technical}
        />
      )
    case 'sentiment':
      return (
        <SentimentSection
          result={analysis.sentiment}
          llmSummary={llmSections.sentiment}
        />
      )
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
  const [pathname, setPathname] = useState(() => window.location.pathname)

  useEffect(() => {
    const onPopState = () => {
      setPathname(window.location.pathname)
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
    }
  }, [])

  const navigate = useCallback((path: string) => {
    if (path !== window.location.pathname) {
      window.history.pushState({}, '', path)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
    setPathname(path)
  }, [])

  return { pathname, navigate }
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

function normalizeTab(value: string): AnalysisTab {
  const raw = value.trim().toLowerCase()
  if (raw === 'fundamental' || raw === 'technical' || raw === 'sentiment') {
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

function tradingViewIntervalFromPeriod(period: string): string {
  if (period === '1mo') {
    return '60'
  }
  if (period === '5y') {
    return 'M'
  }
  if (period === '2y' || period === '1y') {
    return 'W'
  }
  return 'D'
}

function buildTradingViewChartUrl(symbol: string, interval: string): string {
  const params = new URLSearchParams({
    symbol,
    interval,
    theme: 'light',
    style: '1',
    locale: 'en',
    timezone: 'Etc/UTC',
    withdateranges: '1',
    hideideas: '1',
    allow_symbol_change: '0',
    saveimage: '1',
    toolbarbg: 'f7f3eb',
    studies: '[]',
    details: '1',
    hotlist: '0',
    calendar: '0',
    support_host: 'https://www.tradingview.com',
  })
  return `https://s.tradingview.com/widgetembed/?${params.toString()}`
}

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

function formatCompact(value: number | null | undefined): string {
  if (typeof value !== 'number') {
    return 'N/A'
  }
  return compactFormatter.format(value)
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

function rangeValue(
  low: number | null | undefined,
  high: number | null | undefined,
  currency: string,
): string {
  return `${formatCurrency(low, currency)} - ${formatCurrency(high, currency)}`
}

function safeText(value: string | null | undefined): string {
  if (!value) {
    return 'N/A'
  }
  return value
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
