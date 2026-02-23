import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { ReactElement } from 'react'
import './App.css'
import { fetchAnalysis } from './api'
import type {
  AnalysisResponse,
  FundamentalData,
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
  { key: 'full-report', label: 'FULL REPORT' },
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

      {!isLoading && !error && analysis && renderSection(tab, analysis, period)}
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
  selectedPeriod: string
  llmSummary?: string
}

function TechnicalSection({
  result,
  selectedPeriod,
  llmSummary,
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
  const tradingViewSymbol = toTradingViewSymbol(data.symbol)
  const tradingViewInterval = tradingViewIntervalFromPeriod(selectedPeriod)
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
              ['Trend', safeText(result.trend)],
              ['Signal', safeText(result.signal)],
              ['Last close', formatCurrency(data.lastClose, 'USD')],
              ['SMA20', formatCurrency(data.sma20, 'USD')],
              ['SMA50', formatCurrency(data.sma50, 'USD')],
              ['RSI (14)', formatNumber(data.rsi)],
              ['52W range', rangeValue(data['52WeekLow'], data['52WeekHigh'], 'USD')],
              ['Selected period', selectedPeriod],
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

function FullReportSection({ analysis }: { analysis: AnalysisResponse }) {
  const reportText = analysis.report?.trim() ?? ''
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
    hide_side_toolbar: '1',
    hideideas: '1',
    allow_symbol_change: '0',
    saveimage: '1',
    toolbarbg: 'f7f3eb',
    studies: '[]',
    details: '0',
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
