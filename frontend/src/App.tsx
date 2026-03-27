import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactElement } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  AreaChart, Area,
  PieChart, Pie, Cell,
  LineChart, Line
} from 'recharts'
import './App.css'
import { AuthPanel } from './components/AuthPanel'
import { StockSearchForm } from './components/StockSearchForm'
import { fetchAnalysis, fetchComparisonAnalysis, fetchCurrentUser, loginUser, logoutUser, registerUser } from './api'
import type {
  AnalysisResponse,
  AuthMode,
  AuthUser,
  ComparisonResponse,
  FundamentalData,
  OhlcvPoint,
  ReportSections,
  SentimentHeadline,
  TechnicalData,
  TechnicalResult,
} from './types'

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
  | { type: 'auth'; mode: AuthMode }
  | { type: 'stock'; ticker: string; tab: AnalysisTab }
  | { type: 'compare' }

type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
})

const decimalFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
})

const currencyFormatterCache = new Map<string, Intl.NumberFormat>()

function App() {
  const { pathname, navigate } = usePathRouter()
  const route = useMemo(() => parseRoute(pathname), [pathname])
  const activeTicker = route.type === 'stock' ? route.ticker : null
  const [authStatus, setAuthStatus] = useState<AuthStatus>('loading')
  const [authUser, setAuthUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    let cancelled = false

    fetchCurrentUser()
      .then((user) => {
        if (cancelled) {
          return
        }
        setAuthUser(user)
        setAuthStatus(user ? 'authenticated' : 'anonymous')
      })
      .catch(() => {
        if (cancelled) {
          return
        }
        setAuthUser(null)
        setAuthStatus('anonymous')
      })

    return () => {
      cancelled = true
    }
  }, [])

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

  const goCompare = useCallback(() => {
    navigate('/compare')
  }, [navigate])

  const openAuthPage = useCallback(
    (mode: AuthMode) => {
      navigate(mode === 'signup' ? '/signup' : '/login')
    },
    [navigate],
  )

  const handleLogin = useCallback(
    async (values: { identifier: string; password: string }) => {
      const user = await loginUser(values.identifier, values.password)
      setAuthUser(user)
      setAuthStatus('authenticated')
      navigate('/')
    },
    [navigate],
  )

  const handleSignup = useCallback(
    async (values: {
      username: string
      email: string
      password: string
      confirmPassword: string
    }) => {
      const user = await registerUser(values)
      setAuthUser(user)
      setAuthStatus('authenticated')
      navigate('/')
    },
    [navigate],
  )

  const handleLogout = useCallback(async () => {
    try {
      await logoutUser()
    } finally {
      setAuthUser(null)
      setAuthStatus('anonymous')
      navigate('/')
    }
  }, [navigate])

  return (
    <div className="app-shell">
      <HeaderBar
        key={`${activeTicker ?? 'home'}-${authStatus}`}
        authStatus={authStatus}
        isAuthenticated={authStatus === 'authenticated'}
        showSearch={route.type === 'stock'}
        user={authUser}
        initialSearch={activeTicker ?? ''}
        onAuthModeChange={openAuthPage}
        onLogout={handleLogout}
        onSearch={handleSearch}
        onHome={goHome}
        onCompare={goCompare}
      />

      <main className="content">
        {route.type === 'stock' ? (
          <AnalysisPage
            key={route.ticker}
            ticker={route.ticker}
            tab={route.tab}
            onTabChange={(tab) => navigate(`/stock/${encodeURIComponent(route.ticker)}/${tab}`)}
          />
        ) : route.type === 'compare' ? (
          <ComparePage />
        ) : route.type === 'auth' ? (
          <AuthPage
            authMode={route.mode}
            onAuthModeChange={openAuthPage}
            onLogin={handleLogin}
            onSignup={handleSignup}
          />
        ) : (
          <HomePage onSearch={handleSearch} onCompare={goCompare} user={authUser} />
        )}
      </main>
    </div>
  )
}

type HeaderBarProps = {
  authStatus: AuthStatus
  isAuthenticated: boolean
  initialSearch: string
  onAuthModeChange: (mode: AuthMode) => void
  onLogout: () => void
  onSearch: (ticker: string) => void
  onHome: () => void
  onCompare: () => void
  showSearch: boolean
  user: AuthUser | null
}

function HeaderBar({
  authStatus,
  isAuthenticated,
  initialSearch,
  onAuthModeChange,
  onLogout,
  onSearch,
  onHome,
  onCompare,
  showSearch,
  user,
}: HeaderBarProps) {
  const [isHidden, setIsHidden] = useState(false)
  const lastScrollYRef = useRef(0)

  useEffect(() => {
    const onScroll = () => {
      const currentScrollY = window.scrollY
      const previousScrollY = lastScrollYRef.current

      if (currentScrollY <= 24) {
        setIsHidden(false)
      } else if (currentScrollY > previousScrollY && currentScrollY > 96) {
        setIsHidden(true)
      } else if (currentScrollY < previousScrollY) {
        setIsHidden(false)
      }

      lastScrollYRef.current = currentScrollY
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  return (
    <header className={`top-bar${isHidden ? ' is-hidden' : ''}`}>
      <button className="brand" type="button" onClick={onHome}>
        StockInsight
      </button>
      {showSearch ? (
        <StockSearchForm
          className="top-search"
          initialValue={initialSearch}
          onSearch={onSearch}
          placeholder="Search company or ticker"
          ariaLabel="Search company or ticker"
          buttonLabel="Search"
        />
      ) : (
        <div className="top-search-placeholder" aria-hidden="true" />
      )}
      <div className="top-actions">
        <button type="button" className="compare-nav-btn" onClick={onCompare}>
          Compare
        </button>
        {authStatus === 'loading' ? (
          <span className="session-chip">Restoring session...</span>
        ) : isAuthenticated ? (
          <>
            <span className="session-chip">
              Signed in as <strong>{user?.username ?? 'user'}</strong>
            </span>
            <button type="button" className="secondary" onClick={onLogout}>
              Log Out
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => onAuthModeChange('login')}>
              Log In
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => onAuthModeChange('signup')}
            >
              Create Account
            </button>
          </>
        )}
      </div>
    </header>
  )
}

type HomePageProps = {
  onSearch: (ticker: string) => void
  onCompare: () => void
  user: AuthUser | null
}

function HomePage({ onSearch, onCompare, user }: HomePageProps) {
  if (user) {
    return (
      <section className="hero">
        <div className="hero-single">
          <p className="kicker">Live equity intelligence workspace</p>
          <h1>StockInsight</h1>
          <p>
            Welcome back, {user.username}. Search any company or ticker to open
            structured analysis sections for overall, fundamental, technical, and
            sentiment views.
          </p>
          <h2>Start With A Company Or Ticker</h2>
          <StockSearchForm
            className="hero-search"
            onSearch={onSearch}
            placeholder="Enter a company name or ticker"
            ariaLabel="Search for a company or ticker"
            buttonLabel="Open Analysis"
          />
          <p>Examples: Apple, Microsoft, AAPL, TSLA, META.</p>
          <div className="hero-compare-cta">
            <span className="hero-divider-text">or</span>
            <button type="button" className="compare-cta-btn" onClick={onCompare}>
              Compare Multiple Stocks
            </button>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="hero">
      <div className="hero-single">
        <p className="kicker">Live equity intelligence workspace</p>
        <h1>StockInsight</h1>
        <p>
          Search any company or ticker to open structured analysis sections for overall,
          fundamental, technical, and sentiment views.
        </p>
        <h2>Start With A Company Or Ticker</h2>
        <StockSearchForm
          className="hero-search"
          onSearch={onSearch}
          placeholder="Enter a company name or ticker"
          ariaLabel="Search for a company or ticker"
          buttonLabel="Open Analysis"
        />
        <p>Examples: Apple, Microsoft, AAPL, TSLA, META.</p>
        <div className="hero-compare-cta">
          <span className="hero-divider-text">or</span>
          <button type="button" className="compare-cta-btn" onClick={onCompare}>
            Compare Multiple Stocks
          </button>
        </div>
      </div>
    </section>
  )
}

function ComparePage() {
  const [tickers, setTickers] = useState<string[]>(() => {
    try {
      const saved = sessionStorage.getItem('compareTickers')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [results, setResults] = useState<ComparisonResponse | null>(() => {
    try {
      const saved = sessionStorage.getItem('compareResults')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    sessionStorage.setItem('compareTickers', JSON.stringify(tickers))
  }, [tickers])

  useEffect(() => {
    if (results) {
      sessionStorage.setItem('compareResults', JSON.stringify(results))
    } else {
      sessionStorage.removeItem('compareResults')
    }
  }, [results])

  const addTicker = useCallback((raw: string) => {
    const ticker = raw.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, '')
    if (!ticker) return
    setTickers((prev) => {
      if (prev.includes(ticker)) return prev
      if (prev.length >= 10) return prev
      return [...prev, ticker]
    })
  }, [])

  const removeTicker = useCallback((ticker: string) => {
    setTickers((prev) => prev.filter((t) => t !== ticker))
  }, [])

  const handleRun = useCallback(async () => {
    if (tickers.length < 2) return
    setIsLoading(true)
    setError('')
    setResults(null)
    setElapsedSeconds(0)

    const startTime = Date.now()
    timerRef.current = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000))
    }, 1000)

    try {
      const response = await fetchComparisonAnalysis(tickers, results)
      setResults(response)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Comparison failed.')
    } finally {
      setIsLoading(false)
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [tickers, results])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  const navigate = useCallback((path: string) => {
    window.history.pushState({}, '', path)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, [])

  const orderedTickers = useMemo(() => {
    if (!results) return []
    return tickers.filter((t) => t in results.results)
  }, [tickers, results])

  const getResult = useCallback((ticker: string): AnalysisResponse | null => {
    if (!results) return null
    const entry = results.results[ticker]
    if (!entry || 'error' in entry) return null
    return entry as AnalysisResponse
  }, [results])

  const getError = useCallback((ticker: string): string | null => {
    if (!results) return null
    const entry = results.results[ticker]
    if (entry && 'error' in entry) return (entry as { error: string }).error
    return null
  }, [results])

  return (
    <section className="compare-page">
      <div className="compare-header reveal">
        <p className="kicker">Side-by-Side Analysis</p>
        <h1>Compare Stocks</h1>
        <p>Add up to 10 tickers and run a full parallel analysis to compare them.</p>
      </div>

      <div className="compare-input-area reveal">
        <div className="compare-ticker-chips">
          {tickers.map((t) => (
            <span key={t} className="compare-chip">
              {t}
              <button
                type="button"
                className="compare-chip-remove"
                onClick={() => removeTicker(t)}
                aria-label={`Remove ${t}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="compare-input-row">
          <StockSearchForm
            className="compare-search"
            onSearch={addTicker}
            placeholder={tickers.length >= 10 ? 'Max 10 tickers' : 'Add a ticker...'}
            ariaLabel="Add ticker to comparison"
            buttonLabel="Add"
          />
        </div>
        <div className="compare-actions">
          <button
            type="button"
            className="compare-run-btn"
            onClick={handleRun}
            disabled={tickers.length < 2 || isLoading}
          >
            {isLoading ? `Analyzing... (${elapsedSeconds}s)` : 'Run Comparison'}
          </button>
          {tickers.length > 0 && !isLoading && (
            <button
              type="button"
              className="compare-clear-btn"
              onClick={() => { setTickers([]); setResults(null); setError('') }}
            >
              Clear All
            </button>
          )}
        </div>
        {tickers.length > 0 && tickers.length < 2 && (
          <p className="compare-hint">Add at least 2 tickers to compare.</p>
        )}
      </div>

      {isLoading && (
        <div className="compare-loading reveal">
          <div className="compare-loading-spinner" />
          <p>Running parallel analysis for {tickers.length} stocks...</p>
          <p className="compare-loading-elapsed">{elapsedSeconds}s elapsed</p>
        </div>
      )}

      {error && !isLoading && (
        <div className="error-card reveal">
          <h2>Comparison failed</h2>
          <p>{error}</p>
          <button type="button" onClick={handleRun}>Retry</button>
        </div>
      )}

      {results && !isLoading && orderedTickers.length > 0 && (
        <div className="compare-results reveal">
          <div className="compare-table-wrapper">
            <table className="compare-table">
              <thead>
                <tr>
                  <th className="compare-metric-col">Metric</th>
                  {orderedTickers.map((t) => (
                    <th key={t} className="compare-ticker-col">{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <CompareRow label="Company" tickers={orderedTickers} render={(t) => {
                  const r = getResult(t)
                  const err = getError(t)
                  if (err) return <span className="compare-error-cell" title={err}>Error</span>
                  return r?.fundamental?.data?.shortName ?? r?.fundamental?.data?.longName ?? t
                }} />
                <CompareRow label="Price" tickers={orderedTickers} render={(t) => {
                  const r = getResult(t)
                  if (!r) return '—'
                  const price = r.fundamental?.data?.currentPrice ?? r.technical?.indicators?.close
                  const currency = r.fundamental?.data?.currency ?? r.technical?.currency ?? 'USD'
                  return price != null ? formatCurrency(price, currency) : '—'
                }} />
                <CompareRow label="Overall Score" tickers={orderedTickers} className="compare-score-row" render={(t) => {
                  const r = getResult(t)
                  if (!r) return '—'
                  return <span className={`compare-score tone-${toneFromVerdict(r.overview.verdict)}`}>{r.overview.overallScore.toFixed(1)}</span>
                }} />
                <CompareRow label="Verdict" tickers={orderedTickers} render={(t) => {
                  const r = getResult(t)
                  if (!r) return '—'
                  return <span className={`verdict ${toneFromVerdict(r.overview.verdict)}`}>{r.overview.verdict}</span>
                }} />
                <CompareRow label="Fundamental" tickers={orderedTickers} render={(t) => {
                  const r = getResult(t)
                  return r?.overview.fundamentalScore != null ? r.overview.fundamentalScore.toFixed(1) : '—'
                }} />
                <CompareRow label="Technical" tickers={orderedTickers} render={(t) => {
                  const r = getResult(t)
                  return r?.overview.technicalScore != null ? r.overview.technicalScore.toFixed(1) : '—'
                }} />
                <CompareRow label="Sentiment" tickers={orderedTickers} render={(t) => {
                  const r = getResult(t)
                  return r?.overview.sentimentScore != null ? r.overview.sentimentScore.toFixed(1) : '—'
                }} />
                <CompareRow label="Market Cap" tickers={orderedTickers} render={(t) => {
                  const r = getResult(t)
                  const mc = r?.fundamental?.data?.marketCap
                  return mc != null ? compactFormatter.format(mc) : '—'
                }} />
                <CompareRow label="P/E (Trailing)" tickers={orderedTickers} render={(t) => {
                  const r = getResult(t)
                  const pe = r?.fundamental?.data?.trailingPE
                  return pe != null ? pe.toFixed(2) : '—'
                }} />
                <CompareRow label="ROE" tickers={orderedTickers} render={(t) => {
                  const r = getResult(t)
                  const roe = r?.fundamental?.data?.returnOnEquity
                  return roe != null ? `${(roe * 100).toFixed(1)}%` : '—'
                }} />
                <CompareRow label="Debt/Equity" tickers={orderedTickers} render={(t) => {
                  const r = getResult(t)
                  const de = r?.fundamental?.data?.debtToEquity
                  return de != null ? de.toFixed(2) : '—'
                }} />
                <CompareRow label="Trend" tickers={orderedTickers} render={(t) => {
                  const r = getResult(t)
                  return r?.technical?.trend ?? '—'
                }} />
                <CompareRow label="Signal" tickers={orderedTickers} render={(t) => {
                  const r = getResult(t)
                  return r?.technical?.signal ?? '—'
                }} />
                <tr className="compare-action-row">
                  <td className="compare-metric-col"></td>
                  {orderedTickers.map((t) => (
                    <td key={t}>
                      {getResult(t) ? (
                        <button
                          type="button"
                          className="compare-view-btn"
                          onClick={() => navigate(`/stock/${encodeURIComponent(t)}/overview`)}
                        >
                          View Full Analysis
                        </button>
                      ) : (
                        <span className="compare-error-cell">{getError(t) ?? 'N/A'}</span>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}

function CompareRow({ label, tickers, render, className }: {
  label: string
  tickers: string[]
  render: (ticker: string) => React.ReactNode
  className?: string
}) {
  return (
    <tr className={className}>
      <td className="compare-metric-col">{label}</td>
      {tickers.map((t) => (
        <td key={t}>{render(t)}</td>
      ))}
    </tr>
  )
}

type AuthPageProps = {

  authMode: AuthMode
  onAuthModeChange: (mode: AuthMode) => void
  onLogin: (values: { identifier: string; password: string }) => Promise<void>
  onSignup: (values: {
    username: string
    email: string
    password: string
    confirmPassword: string
  }) => Promise<void>
}

function AuthPage({
  authMode,
  onAuthModeChange,
  onLogin,
  onSignup,
}: AuthPageProps) {
  return (
    <section className="hero hero-grid">
      <div className="hero-single">
        <p className="kicker">Session Access</p>
        <h1>StockInsight</h1>
        <p>
          Sign in to save your session and return faster later. Public search and
          analysis stay available from the landing page.
        </p>
        <div className="auth-feature-list">
          <p>Use your username or email to access your account.</p>
          <p>Create an account if you want a persistent signed-in session.</p>
          <p>Return to the home page anytime to keep searching tickers publicly.</p>
        </div>
      </div>
      <AuthPanel
        mode={authMode}
        onModeChange={onAuthModeChange}
        onLogin={onLogin}
        onSignup={onSignup}
      />
    </section>
  )
}

type AnalysisPageProps = {
  ticker: string
  tab: AnalysisTab
  onTabChange: (tab: AnalysisTab) => void
}

function AnalysisPage({ ticker, tab, onTabChange }: AnalysisPageProps) {
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const [isGeneratingReport, setIsGeneratingReport] = useState(false)

  useEffect(() => {
    let cancelled = false

    fetchAnalysis(ticker)
      .then((payload) => {
        if (!cancelled) {
          setAnalysis(payload)
          // If the analysis doesn't have a report yet, generate it statelessly
          if (!payload.reportSections || !payload.reportSections.overall) {
            setIsGeneratingReport(true)
            import('./api')
              .then(async ({ fetchAnalysisReport, setAnalysisCache }) => {
                const reportPayload = await fetchAnalysisReport(ticker, payload)
                return { reportPayload, setAnalysisCache }
              })
              .then(({ reportPayload, setAnalysisCache }) => {
                const nextAnalysis: AnalysisResponse = {
                  ...payload,
                  report: reportPayload.fullReport,
                  reportSections: reportPayload.sections,
                  reportSource: reportPayload.source,
                }

                // Persist generated report so re-opening the same ticker doesn't regenerate it.
                setAnalysisCache(ticker, nextAnalysis)

                if (!cancelled) {
                  setAnalysis(nextAnalysis)
                }
              })
            .catch((err) => {
              console.error('Failed to generate report', err)
            })
            .finally(() => {
              if (!cancelled) {
                setIsGeneratingReport(false)
              }
            })
          }
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
  }, [retryKey, ticker])

  const companyName = useMemo(() => {
    const data = analysis?.fundamental?.data
    if (!data) {
      return ''
    }
    return data.shortName ?? data.longName ?? ''
  }, [analysis])

  const priceInfo = useMemo(() => {
    if (!analysis) return null
    const currentPrice =
      analysis.fundamental?.data?.currentPrice ??
      analysis.technical?.data?.lastClose ??
      analysis.technical?.indicators?.close ??
      null
    if (!isFiniteNumber(currentPrice)) return null

    const ohlcv = analysis.technical?.data?.ohlcv ?? analysis.technical?.ohlcv ?? []
    let previousClose: number | null = null
    if (ohlcv.length >= 2) {
      const prev = ohlcv[ohlcv.length - 2]?.close
      if (isFiniteNumber(prev)) previousClose = prev
    }
    const change = previousClose !== null ? currentPrice - previousClose : null
    const changePercent = change !== null && previousClose !== null && previousClose !== 0 ? (change / previousClose) * 100 : null
    const currency = resolveAnalysisCurrency(analysis)
    return { currentPrice, change, changePercent, currency }
  }, [analysis])

  return (
    <section className="analysis-layout">
      <div className="analysis-header reveal">
        <div>
          <p className="kicker">Ticker Detail</p>
          <h1>{companyName ? `${companyName} (${ticker})` : ticker}</h1>
        </div>
        {priceInfo && (
          <div className="ticker-price-block">
            <span className="ticker-current-price">
              {formatCurrency(priceInfo.currentPrice, priceInfo.currency)}
            </span>
            {priceInfo.change !== null && priceInfo.changePercent !== null && (
              <span className={`ticker-price-change ${priceInfo.change >= 0 ? 'positive' : 'negative'}`}>
                <span className="ticker-price-arrow" aria-hidden="true">
                  {priceInfo.change >= 0 ? '▲' : '▼'}
                </span>
                {priceInfo.change >= 0 ? '+' : ''}{decimalFormatter.format(priceInfo.change)}
                {' '}({priceInfo.change >= 0 ? '+' : ''}{priceInfo.changePercent.toFixed(2)}%)
              </span>
            )}
          </div>
        )}
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

      {!isLoading && !error && analysis && renderSection(tab, analysis, ticker, isGeneratingReport)}
    </section>
  )
}

type OverviewSectionProps = {
  overview: AnalysisResponse['overview']
  llmSummary?: string
  technical?: TechnicalResult | null
  sentiment?: import('./types').SentimentResult | null
  sentimentLlm?: string
  ticker?: string
  displayCurrency?: string
}

function OverviewSection({ overview, llmSummary, technical, sentimentLlm, ticker, displayCurrency }: OverviewSectionProps) {
  const summary =
    llmSummary?.trim() ||
    'Composite score blends fundamental, technical, and sentiment signals into one decision-oriented output.'

  const overviewChartRef = useRef<HTMLDivElement | null>(null)
  const [isOverviewChartReady, setIsOverviewChartReady] = useState(false)
  const [ovChartType, setOvChartType] = useState<ChartType>('candle')
  const [ovChartDuration, setOvChartDuration] = useState<string>('1M')
  const [ovChartData, setOvChartData] = useState<any[]>([])
  const [ovChartCurrency, setOvChartCurrency] = useState<string | null>(null)
  const [isOvChartLoading, setIsOvChartLoading] = useState(false)
  const [ovChartFetchError, setOvChartFetchError] = useState('')

  const fallbackOhlcv = useMemo(() => {
    if (!technical) return []
    const data = resolveTechnicalData(technical)
    return data.ohlcv ?? []
  }, [technical])

  const overviewCurrency = displayCurrency ?? 'USD'
  const activeCurrency = ovChartCurrency ? normalizeCurrencyCode(ovChartCurrency) : overviewCurrency

  const activeChartRows = useMemo(
    () => (ovChartData.length > 0 ? ovChartData : fallbackOhlcv),
    [ovChartData, fallbackOhlcv],
  )

  const chartPerformance = useMemo(() => {
    const closes = activeChartRows
      .map((point) => point?.close)
      .filter((value): value is number => isFiniteNumber(value))
    if (closes.length < 2 || closes[0] === 0) return null
    const start = closes[0]
    const end = closes[closes.length - 1]
    const change = end - start
    return { start, end, change, percent: (change / start) * 100 }
  }, [activeChartRows])


  const chartDirectionLabel =
    chartPerformance && chartPerformance.change > 0
      ? 'Uptrend'
      : chartPerformance && chartPerformance.change < 0
        ? 'Downtrend'
        : 'Sideways'

  const livePrice = useMemo(() => {
    const latest = activeChartRows[activeChartRows.length - 1]?.close
    if (isFiniteNumber(latest)) return latest
    return null
  }, [activeChartRows])

  // Fetch chart data when duration changes
  useEffect(() => {
    if (!ticker) return
    let cancelled = false
    setIsOvChartLoading(true)
    setOvChartFetchError('')
    setOvChartCurrency(null)

    import('./api')
      .then(({ fetchChartData }) => fetchChartData(ticker, ovChartDuration))
      .then((payload) => {
        if (!cancelled) {
          setOvChartData(payload.ohlcv || [])
          setOvChartCurrency(payload.currency ?? null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setOvChartFetchError(err instanceof Error ? err.message : 'Failed to load chart data.')
          setOvChartData([])
        }
      })
      .finally(() => { if (!cancelled) setIsOvChartLoading(false) })

    return () => { cancelled = true }
  }, [ticker, ovChartDuration])

  // Init LightweightCharts
  useEffect(() => {
    const container = overviewChartRef.current
    if (!container || activeChartRows.length === 0) return

    let cancelled = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let chart: any | null = null
    let resizeObserver: ResizeObserver | null = null

    const initChart = async () => {
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
        layout: { background: { color: 'white' }, textColor: '#111827' },
        rightPriceScale: { visible: true },
        timeScale: { borderColor: '#e5e7eb', timeVisible: true },
        grid: { vertLines: { color: '#f3f4f6' }, horzLines: { color: '#f3f4f6' } },
        localization: { locale: 'en-US', priceFormatter: (price: number) => formatCurrency(price, activeCurrency) },
        handleScroll: false,
        handleScale: false,
      })

      const ohlcv = activeChartRows
      let candles = ohlcv
        .map((bar) => {
          const t = bar.date
          const dt = typeof t === 'string' ? new Date(t) : new Date(t * 1000)
          if (Number.isNaN(dt.getTime())) return null
          return { time: dt.getTime() / 1000 as any, open: bar.open, high: bar.high, low: bar.low, close: bar.close }
        })
        .filter(Boolean) as Array<{ time: any; open: number; high: number; low: number; close: number }>

      candles.sort((a, b) => a.time - b.time)
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
      if (ovChartType === 'candle') {
        series = chart.addCandlestickSeries()
        series.setData(candles)
      } else if (ovChartType === 'bar') {
        series = chart.addBarSeries()
        series.setData(candles)
      } else if (ovChartType === 'area') {
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
      if (!cancelled) setIsOverviewChartReady(true)
      if (cancelled) { chart?.remove(); return }

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
      if (!cancelled) setIsOverviewChartReady(true)
    })

    return () => {
      cancelled = true
      if (resizeObserver && container) resizeObserver.unobserve(container)
      if (chart) chart.remove()
    }
  }, [activeChartRows, ovChartType, ovChartDuration, activeCurrency])

  // News insights from sentiment
  const newsInsights = useMemo(() => {
    const sentimentText = sentimentLlm?.trim() || ''
    if (!sentimentText) return null
    const parsed = parseSentimentSummary(sentimentText)
    if (parsed.insights.length === 0) return null
    return parsed.insights
  }, [sentimentLlm])


  return (
    <article className="panel reveal">
      <header className="panel-head">
        <h2>Overall Analysis</h2>
        <span className={`verdict ${toneFromVerdict(overview.verdict)}`}>
          {overview.verdict}
        </span>
      </header>
      <p className="analysis-copy">{summary}</p>

      {/* Chart + Scores Layout */}
      {fallbackOhlcv.length > 0 && (
        <div className="overview-chart-layout">
          <div className="chart-block">
            <div className="chart-surface-head">
              <div className="chart-context">
                <div className="chart-context-main">
                  <div className="chart-symbol-price">
                    <h3>{ticker?.toUpperCase() ?? ''}</h3>
                    <span className="chart-live-price">
                      <span className="chart-live-dot" aria-hidden="true" />
                      {livePrice !== null ? formatCurrency(livePrice, activeCurrency) : 'N/A'}
                    </span>
                  </div>
                </div>
                <p className="chart-context-meta">
                  {chartPerformance
                    ? `${chartDirectionLabel} in ${ovChartDuration}: ${formatCurrency(chartPerformance.start, activeCurrency)} -> ${formatCurrency(chartPerformance.end, activeCurrency)}`
                    : 'Switch duration and chart style to inspect movement.'}
                </p>
              </div>
              <div className="chart-controls" aria-label="Chart controls">
                <div className="chart-type-selector">
                  {CHART_DURATION_OPTIONS.map((dur) => (
                    <button
                      key={dur}
                      type="button"
                      className={ovChartDuration === dur ? 'active' : ''}
                      onClick={() => setOvChartDuration(dur)}
                    >
                      {dur}
                    </button>
                  ))}
                </div>
                <select
                  className="chart-type-select"
                  value={ovChartType}
                  onChange={(e) => setOvChartType(e.target.value as ChartType)}
                  aria-label="Select chart type"
                >
                  {CHART_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div
              className={`tv-chart-shell${isOvChartLoading ? ' is-loading' : ''}${isOverviewChartReady ? ' is-ready' : ''}${ovChartFetchError ? ' has-error' : ''}`}
            >
              <div
                key={`ov-${ovChartType}-${ovChartDuration}`}
                className="tv-chart-wrap"
                ref={overviewChartRef}
              />
              {isOvChartLoading && (
                <div className="chart-overlay" role="status" aria-live="polite">
                  <span className="chart-loader-line" />
                  <p>Refreshing chart...</p>
                </div>
              )}
              {!isOvChartLoading && ovChartFetchError && (
                <div className="chart-overlay chart-overlay-error" role="status">
                  <p>{ovChartFetchError}</p>
                </div>
              )}
              {!isOvChartLoading && !ovChartFetchError && activeChartRows.length === 0 && (
                <div className="chart-overlay" role="status">
                  <p>No chart data available for this range.</p>
                </div>
              )}
            </div>
          </div>
          <div className="overview-scores-column">
            <div className={`overview-score-card verdict-card tone-${toneFromVerdict(overview.verdict)}`}>
              <span className="overview-score-label">Verdict</span>
              <strong className="overview-score-value">{overview.verdict}</strong>
            </div>
            <div className={`overview-score-card overall tone-${toneFromVerdict(overview.verdict)}`}>
              <span className="overview-score-label">Overall Score</span>
              <strong className="overview-score-value">{formatScore(overview.overallScore)}</strong>
              <span className="overview-score-band">{scoreBand(overview.overallScore)}</span>
            </div>
            <div className="overview-score-card">
              <span className="overview-score-label">Fundamental</span>
              <strong className="overview-score-value">{formatScore(overview.fundamentalScore)}</strong>
              <span className="overview-score-band">{scoreBand(overview.fundamentalScore)}</span>
            </div>
            <div className="overview-score-card">
              <span className="overview-score-label">Technical</span>
              <strong className="overview-score-value">{formatScore(overview.technicalScore)}</strong>
              <span className="overview-score-band">{scoreBand(overview.technicalScore)}</span>
            </div>
            <div className="overview-score-card">
              <span className="overview-score-label">Sentiment</span>
              <strong className="overview-score-value">{formatScore(overview.sentimentScore)}</strong>
              <span className="overview-score-band">{scoreBand(overview.sentimentScore)}</span>
            </div>
          </div>
        </div>
      )}

      {/* News Insights Block */}
      {newsInsights && newsInsights.length > 0 && (
        <section className="sentiment-summary-card">
          <h3>Main Insights from news headlines</h3>
          <ul className="analysis-bullets">
            {newsInsights.map((item, index) => (
              <li key={`overview-insight-${index}`}>{item}</li>
            ))}
          </ul>
        </section>
      )}

    </article>
  )
}

type FundamentalSectionProps = {
  result: AnalysisResponse['fundamental']
  llmSummary?: string
  displayCurrency: string
}

function StackedBarBurn({ labelA, labelB, valA, valB, colorA, colorB }: { labelA: string, labelB: string, valA?: number, valB?: number, colorA: string, colorB: string }) {
  if (valA === undefined && valB === undefined) return null;
  const a = valA || 0;
  const b = valB || 0;
  const total = a + b;
  const percentA = total > 0 ? (a / total) * 100 : 0;
  const percentB = total > 0 ? (b / total) * 100 : 0;

  return (
    <div className="stacked-widget">
      <div className="stacked-track">
        <div className="stacked-fill" style={{ width: `${percentA}%`, backgroundColor: colorA }}></div>
        <div className="stacked-fill" style={{ width: `${percentB}%`, backgroundColor: colorB }}></div>
      </div>
      <div className="stacked-labels">
        <div className="stacked-label"><span className="swatch" style={{backgroundColor: colorA}}></span>{labelA}: {a > 0 ? compactFormatter.format(a) : 'N/A'}</div>
        <div className="stacked-label"><span className="swatch" style={{backgroundColor: colorB}}></span>{labelB}: {b > 0 ? compactFormatter.format(b) : 'N/A'}</div>
      </div>
    </div>
  )
}

const PIE_COLORS = ['#2563eb', '#10b981', '#cbd5e1']

function FundamentalSection({
  result,
  llmSummary,
  displayCurrency,
}: FundamentalSectionProps) {
  if (!result) {
    return (
      <UnavailablePanel title="Fundamental Analysis">
        Fundamental data is currently unavailable for this ticker.
      </UnavailablePanel>
    )
  }

  const data: FundamentalData = result.data
  const summary = llmSummary?.trim() || summarizeScore(result.score, 'fundamental')
  const summaryBullets = extractBulletPoints(summary)

  const fundScorePercent = isFiniteNumber(result.score) ? clampPercent(result.score) : 50
  const fundScoreZone = isFiniteNumber(result.score)
    ? result.score < 30 ? 'strong-bearish'
      : result.score < 45 ? 'bearish'
        : result.score < 55 ? 'neutral'
          : result.score < 70 ? 'bullish'
            : 'strong-bullish'
    : 'neutral'
  const fundSignalLabel = isFiniteNumber(result.score)
    ? result.score < 30 ? 'Weak'
      : result.score < 45 ? 'Below Avg'
        : result.score < 55 ? 'Average'
          : result.score < 70 ? 'Good'
            : 'Strong'
    : 'N/A'

  return (
    <article className="panel reveal">
      <header className="panel-head">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ margin: 0 }}>Fundamental Analysis</h2>
          {data.sector && (
            <span style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: '0.1rem' }}>
              Sector: {data.sector}{data.industry ? ` • ${data.industry}` : ''}
            </span>
          )}
        </div>
        <span className="score-tag">{formatScore(result.score)}</span>
      </header>
      {summaryBullets.length > 0 ? (
        <ul className="analysis-bullets">
          {summaryBullets.map((item, index) => (
            <li key={`${item}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="analysis-copy">{summary}</p>
      )}

      <div className="market-hero">
        <div className="fund-hero-metric">
          <span className="label">P/E Ratio</span>
          <span className="val">{formatNumber(data.trailingPE)}</span>
        </div>
        <div className="fund-hero-metric">
          <span className="label">Market Cap</span>
          <span className="val">{data.marketCap ? compactFormatter.format(data.marketCap) : 'N/A'}</span>
        </div>
        <div className="fund-hero-metric">
          <span className="label">Ent. Value</span>
          <span className="val">{data.enterpriseValue ? compactFormatter.format(data.enterpriseValue) : 'N/A'}</span>
        </div>
        <div className="fund-hero-metric">
          <span className="label">Beta</span>
          <span className="val">{formatNumber(data.beta)}</span>
        </div>
        <div className={`fundamental-score-card tone-${scoreToTone(result.score)}`}>
          <h3 style={{ margin: 0, fontSize: '0.82rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)' }}>Fundamental Score</h3>
          <div className={`technical-score-meter-wrap zone-${fundScoreZone}`}>
            <div className="technical-score-meter-head">
              <span className="technical-score-signal">{fundSignalLabel}</span>
              <strong className="technical-score-value">{formatScore(result.score)}</strong>
            </div>
            <div className="technical-score-meter-visual" aria-hidden="true">
              <div className="technical-score-meter-track">
                <div className="technical-score-meter-segments">
                  <span className="segment strong-bearish" />
                  <span className="segment bearish" />
                  <span className="segment neutral" />
                  <span className="segment bullish" />
                  <span className="segment strong-bullish" />
                </div>
                <span
                  className="technical-score-meter-marker"
                  style={{ left: `${fundScorePercent}%` }}
                />
              </div>
              <div className="technical-score-meter-scale">
                {[0, 25, 50, 75, 100].map((tick) => (
                  <span
                    key={`fund-tick-${tick}`}
                    className={`technical-score-meter-tick${tick === 0 ? ' edge-start' : ''}${tick === 100 ? ' edge-end' : ''}`}
                    style={{ left: `${tick}%` }}
                  >
                    <span className="technical-score-meter-tick-mark" />
                    <span className="technical-score-meter-tick-label">{tick}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="fundamentals-grid">
        {/* Card 1: Valuation */}
        <div className="fund-card">
          <h3>Valuation</h3>
          <div className="fund-metrics">
            <div className="metric">
              <span className="label">P/E (Forward)</span>
              <span className="val">{formatNumber(data.forwardPE)}</span>
            </div>
            <div className="metric">
              <span className="label">PEG Ratio</span>
              <span className="val">{formatNumber(data.pegRatio)}</span>
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



        {/* Card 4: Profitability */}
        <div className="fund-card">
          <h3>Profitability</h3>
          <div className="fund-metrics">
            <div className="metric">
              <span className="label">ROE</span>
              <span className="val"><ColoredValue value={data.returnOnEquity} formatFn={formatPercent} /></span>
            </div>
            <div className="metric">
              <span className="label">ROA</span>
              <span className="val"><ColoredValue value={data.returnOnAssets} formatFn={formatPercent} /></span>
            </div>
            <div className="metric">
              <span className="label">ROCE</span>
              <span className="val"><ColoredValue value={data.returnOnCapitalEmployed} formatFn={formatPercent} /></span>
            </div>
            <div className="metric">
              <span className="label">Operating Margin</span>
              <span className="val"><ColoredValue value={data.operatingMargins} formatFn={formatPercent} /></span>
            </div>
            <div className="metric">
              <span className="label">Net Margin</span>
              <span className="val"><ColoredValue value={data.profitMargins} formatFn={formatPercent} /></span>
            </div>
          </div>
        </div>

        {/* Card 5: Financial Health */}
        <div className="fund-card">
          <h3>Financial Health</h3>
          <StackedBarBurn 
            labelA="Total Cash" 
            labelB="Total Debt" 
            valA={data.totalCash} 
            valB={data.totalDebt} 
            colorA="#10b981" 
            colorB="#ef4444" 
          />
          <div className="fund-metrics" style={{marginTop: '1rem'}}>
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

        {/* Card: Sector P/E Comparison */}
        {data.sectorPeersAnalysis && (
          <div className="fund-card" style={{ gridColumn: '1 / -1' }}>
            <h3>Sector P/E Comparison</h3>
            <div className="sector-pe-table-container" style={{ marginTop: '1rem', overflowX: 'auto' }}>
              <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Metric</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Raw Value</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Sector Mean</th>
                    <th style={{ padding: '0.75rem 0.5rem' }}>Relative Standing</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500 }}>Trailing P/E</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>{formatNumber(data.sectorPeersAnalysis.trailing.rawValue)}</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>{formatNumber(data.sectorPeersAnalysis.trailing.sectorMean)}</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <span style={{ 
                        padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, 
                        backgroundColor: 'rgba(0,0,0,0.05)',
                        color: data.sectorPeersAnalysis.trailing.relativeStandingLabel.toLowerCase().includes('under') ? '#10b981' : data.sectorPeersAnalysis.trailing.relativeStandingLabel.toLowerCase().includes('over') ? '#ef4444' : 'inherit' 
                      }}>
                        {data.sectorPeersAnalysis.trailing.relativeStandingLabel}
                        {data.sectorPeersAnalysis.trailing.relativeStandingScore != null ? ` (${data.sectorPeersAnalysis.trailing.relativeStandingScore > 0 ? '+' : ''}${data.sectorPeersAnalysis.trailing.relativeStandingScore.toFixed(2)})` : ''}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '0.75rem 0.5rem', fontWeight: 500 }}>Forward P/E</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>{formatNumber(data.sectorPeersAnalysis.forward.rawValue)}</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>{formatNumber(data.sectorPeersAnalysis.forward.sectorMean)}</td>
                    <td style={{ padding: '0.75rem 0.5rem' }}>
                      <span style={{ 
                        padding: '0.2rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, 
                        backgroundColor: 'rgba(0,0,0,0.05)',
                        color: data.sectorPeersAnalysis.forward.relativeStandingLabel.toLowerCase().includes('under') ? '#10b981' : data.sectorPeersAnalysis.forward.relativeStandingLabel.toLowerCase().includes('over') ? '#ef4444' : 'inherit' 
                      }}>
                        {data.sectorPeersAnalysis.forward.relativeStandingLabel}
                        {data.sectorPeersAnalysis.forward.relativeStandingScore != null ? ` (${data.sectorPeersAnalysis.forward.relativeStandingScore > 0 ? '+' : ''}${data.sectorPeersAnalysis.forward.relativeStandingScore.toFixed(2)})` : ''}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: 'var(--muted)' }}>
                Based on top peers: {data.sectorPeersAnalysis.peers.slice(0, 10).join(', ')}{data.sectorPeersAnalysis.peers.length > 10 ? '...' : ''}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Growth & Dividends Strip */}
      <div className="growth-strip">
        <div className="growth-header">
          <h3>Growth & Dividends</h3>
        </div>
        <div className="growth-metrics">
          <div className="hero-metric">
            <span className="label">Revenue Growth</span>
            <span className="val"><ColoredValue value={data.revenueGrowth} formatFn={formatPercent} /></span>
          </div>
          <div className="hero-metric">
            <span className="label">Earnings Growth</span>
            <span className="val"><ColoredValue value={data.earningsGrowth} formatFn={formatPercent} /></span>
          </div>
          <div className="hero-metric">
            <span className="label">Gross Margin</span>
            <span className="val">{formatPercent(data.grossMargins)}</span>
          </div>
          <div className="hero-metric">
            <span className="label">Dividend Yield</span>
            <span className="val"><ColoredValue value={data.dividendYield} formatFn={formatPercent} /></span>
          </div>
          <div className="hero-metric">
            <span className="label">Payout Ratio</span>
            <span className="val">{formatPercent(data.payoutRatio)}</span>
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
                  <RechartsTooltip formatter={(val: any) => formatCurrency(Number(val), displayCurrency)} cursor={{fill: 'rgba(0,0,0,0.05)'}} />
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
                  <RechartsTooltip formatter={(val: any) => formatCurrency(Number(val), displayCurrency)} />
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

        {data.marginsTrend && data.marginsTrend.length > 0 && (
          <div className="chart-card">
            <h3>Margins History</h3>
            <div className="recharts-wrapper">
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={data.marginsTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="year" tick={{fill: '#6b7280', fontSize: 12}} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(val) => `${(val * 100).toFixed(0)}%`} tick={{fill: '#6b7280', fontSize: 12}} axisLine={false} tickLine={false} width={45} />
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <RechartsTooltip formatter={(val: any) => `${(val * 100).toFixed(2)}%`} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                  <Line type="monotone" dataKey="operatingMargin" name="Operating Margin" stroke="#2563eb" strokeWidth={3} dot={{ strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="netMargin" name="Net Margin" stroke="#10b981" strokeWidth={3} dot={{ strokeWidth: 2, r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
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

const CHART_DURATION_OPTIONS = ['1D', '5D', '1M', '6M', 'YTD', '1Y', '5Y', 'ALL']

type TechnicalSectionProps = {
  result: AnalysisResponse['technical']
  llmSummary?: string
  ticker: string
  companyName?: string
  beta: number | null
  displayCurrency: string
}

function TechnicalSection({
  result,
  llmSummary,
  ticker,
  companyName,
  beta,
  displayCurrency,
}: TechnicalSectionProps) {
  if (!result) {
    return (
      <UnavailablePanel title="Technical Analysis">
        Technical price history is currently unavailable for this ticker.
      </UnavailablePanel>
    )
  }

  const data = resolveTechnicalData(result)
  const technicalCurrency = normalizeCurrencyCode(
    data.currency ?? result.currency ?? displayCurrency,
  )
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
  const low52 = data['52WeekLow']
  const high52 = data['52WeekHigh']
  const has52WeekRange =
    isFiniteNumber(low52) &&
    isFiniteNumber(high52) &&
    high52 > low52 &&
    isFiniteNumber(currentPrice)
  const yearRangePercent = has52WeekRange
    ? clampPercent(((currentPrice - low52) / (high52 - low52)) * 100)
    : 50
  const yearRangeTone: InsightTone = !has52WeekRange
    ? 'neutral'
    : yearRangePercent >= 65
      ? 'bullish'
      : yearRangePercent <= 35
        ? 'bearish'
        : 'neutral'
  const yearRangeStatus = !has52WeekRange
    ? 'Not available'
    : yearRangePercent >= 80
      ? 'Near 52W high'
      : yearRangePercent <= 20
        ? 'Near 52W low'
        : 'Within range'
  const yearRangeValue = has52WeekRange ? `${yearRangePercent.toFixed(1)}%` : 'N/A'

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
      key: 'range52',
      metric: '52W Range Position',
      value: yearRangeValue,
      status: yearRangeStatus,
      tone: yearRangeTone,
      progressPercent: yearRangePercent,
      numeric: has52WeekRange
        ? { value: yearRangePercent, format: 'percent', decimals: 1 }
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
      value: formatCurrency(data.sma20, technicalCurrency),
      status: sma20Position.label,
      tone: sma20Position.tone,
      progressPercent: resolveMovingAverageProgress(data.sma20, currentPrice),
      numeric: isFiniteNumber(data.sma20)
        ? { value: data.sma20, format: 'currency', decimals: 2, currency: technicalCurrency }
        : undefined,
    },
    {
      key: 'sma50',
      metric: '50 Day SMA',
      value: formatCurrency(data.sma50, technicalCurrency),
      status: sma50Position.label,
      tone: sma50Position.tone,
      progressPercent: resolveMovingAverageProgress(data.sma50, currentPrice),
      numeric: isFiniteNumber(data.sma50)
        ? { value: data.sma50, format: 'currency', decimals: 2, currency: technicalCurrency }
        : undefined,
    },
    {
      key: 'sma200',
      metric: '200 Day SMA',
      value: formatCurrency(sma200, technicalCurrency),
      status: sma200Position.label,
      tone: sma200Position.tone,
      progressPercent: resolveMovingAverageProgress(sma200, currentPrice),
      numeric: isFiniteNumber(sma200)
        ? { value: sma200, format: 'currency', decimals: 2, currency: technicalCurrency }
        : undefined,
    },
  ]

  const tradingViewSymbol = toTradingViewSymbol(data.symbol)
  const chartContainerRef = useRef<HTMLDivElement | null>(null)
  const chartShellRef = useRef<HTMLDivElement | null>(null)
  const snapshotSectionRef = useRef<HTMLElement | null>(null)
  const [chartType, setChartType] = useState<ChartType>('candle')
  const [chartDuration, setChartDuration] = useState<string>('1M')
  const [chartData, setChartData] = useState<any[]>([])
  const [chartCurrency, setChartCurrency] = useState<string | null>(null)
  const [isChartLoading, setIsChartLoading] = useState(false)
  const [chartFetchError, setChartFetchError] = useState('')
  const [isChartReady, setIsChartReady] = useState(false)
  const [showPriceRangeMarkers, setShowPriceRangeMarkers] = useState(false)
  const isChartInView = useInViewOnce(chartShellRef, { threshold: 0.2 })
  const isSnapshotInView = useInViewOnce(snapshotSectionRef, { threshold: 0.2 })
  const activeChartRows = useMemo(
    () => (chartData.length > 0 ? chartData : (data.ohlcv ?? [])),
    [chartData, data.ohlcv],
  )
  const chartPerformance = useMemo(() => {
    const closes = activeChartRows
      .map((point) => point?.close)
      .filter((value): value is number => isFiniteNumber(value))
    if (closes.length < 2 || closes[0] === 0) {
      return null
    }
    const start = closes[0]
    const end = closes[closes.length - 1]
    const change = end - start
    return {
      start,
      end,
      change,
      percent: (change / start) * 100,
    }
  }, [activeChartRows])
  const chartDirectionTone: InsightTone =
    chartPerformance && chartPerformance.change > 0
      ? 'bullish'
      : chartPerformance && chartPerformance.change < 0
        ? 'bearish'
        : 'neutral'
  const chartDirectionLabel =
    chartPerformance && chartPerformance.change > 0
      ? 'Uptrend'
      : chartPerformance && chartPerformance.change < 0
        ? 'Downtrend'
        : 'Sideways'
  const livePrice = useMemo(() => {
    const latest = activeChartRows[activeChartRows.length - 1]?.close
    if (isFiniteNumber(latest)) {
      return latest
    }
    return isFiniteNumber(currentPrice) ? currentPrice : null
  }, [activeChartRows, currentPrice])
  const activeCurrency = chartCurrency ?? technicalCurrency
  const technicalScoreTone = scoreToTone(result.score)
  const technicalScorePercent = isFiniteNumber(result.score)
    ? clampPercent(result.score)
    : 50
  const technicalScoreZone = isFiniteNumber(result.score)
    ? result.score < 30
      ? 'strong-bearish'
      : result.score < 45
        ? 'bearish'
        : result.score < 55
          ? 'neutral'
          : result.score < 70
            ? 'bullish'
            : 'strong-bullish'
    : 'neutral'
  const technicalSignalLabel =
    result.signal === 'Strong Bullish'
      ? 'Strongly Bullish'
      : result.signal === 'Strong Bearish'
        ? 'Strongly Bearish'
        : safeText(result.signal)
  const symbolLabel = ticker.toUpperCase()
  const chartTitle = companyName?.trim()
    ? `${companyName.trim()} (${symbolLabel})`
    : symbolLabel

  useEffect(() => {
    setShowPriceRangeMarkers(false)
    if (!isSnapshotInView || priceRangeMarkers.length === 0) {
      return
    }

    const frame = requestAnimationFrame(() => {
      setShowPriceRangeMarkers(true)
    })
    return () => cancelAnimationFrame(frame)
  }, [isSnapshotInView, priceMarkerAnimationKey])

  // Fetch fine-grained chart data when duration changes
  useEffect(() => {
    let cancelled = false
    setIsChartLoading(true)
    setChartFetchError('')
    setChartCurrency(null)

    import('./api')
      .then(({ fetchChartData }) => fetchChartData(ticker, chartDuration))
      .then((payload) => {
        if (!cancelled) {
          setChartData(payload.ohlcv || [])
          setChartCurrency(
            payload.currency ? normalizeCurrencyCode(payload.currency) : null,
          )
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : 'Failed to load chart data.'
          setChartFetchError(message)
          setChartData([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsChartLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [ticker, chartDuration])

  useEffect(() => {
    let cancelled = false
    const container = chartContainerRef.current
    if (!container) return

    setIsChartReady(false)
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
          priceFormatter: (price: number) => formatCurrency(price, activeCurrency),
        },
        handleScroll: false,
        handleScale: false,
      })

      const ohlcv = activeChartRows
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
      if (!cancelled) {
        setIsChartReady(true)
      }

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
      if (!cancelled) {
        setIsChartReady(true)
      }
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
  }, [activeChartRows, tradingViewSymbol, chartType, chartDuration, activeCurrency])

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
          <div className="chart-surface-head">
            <div className="chart-context">
              <div className="chart-context-main">
                <div className="chart-symbol-price">
                  <h3>{chartTitle}</h3>
                  <span className="chart-live-price">
                    <span className="chart-live-dot" aria-hidden="true" />
                    {livePrice !== null ? formatCurrency(livePrice, activeCurrency) : 'N/A'}
                  </span>
                </div>
                <span className={`chart-delta tone-${chartDirectionTone}`}>
                  {chartPerformance
                    ? `${chartPerformance.change >= 0 ? '+' : ''}${chartPerformance.percent.toFixed(2)}%`
                    : 'N/A'}
                </span>
              </div>
              <p className="chart-context-meta">
                {chartPerformance
                  ? `${chartDirectionLabel} in ${chartDuration}: ${formatCurrency(chartPerformance.start, activeCurrency)} -> ${formatCurrency(chartPerformance.end, activeCurrency)}`
                  : 'Switch duration and chart style to inspect movement.'}
              </p>
            </div>
            <div className="chart-controls" aria-label="Chart controls">
              <div className="chart-type-selector">
                {CHART_DURATION_OPTIONS.map((dur) => (
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
                className="chart-type-select"
                value={chartType}
                onChange={(e) => setChartType(e.target.value as ChartType)}
                aria-label="Select chart type"
              >
                {CHART_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div
            ref={chartShellRef}
            className={`tv-chart-shell${isChartLoading ? ' is-loading' : ''}${isChartReady ? ' is-ready' : ''}${chartFetchError ? ' has-error' : ''}${isChartInView ? ' is-armed' : ''}`}
          >
            <div
              key={`${chartType}-${chartDuration}`}
              className="tv-chart-wrap"
              ref={chartContainerRef}
            />
            {isChartLoading && (
              <div className="chart-overlay" role="status" aria-live="polite">
                <span className="chart-loader-line" />
                <p>Refreshing chart...</p>
              </div>
            )}
            {!isChartLoading && chartFetchError && (
              <div className="chart-overlay chart-overlay-error" role="status">
                <p>{chartFetchError}</p>
              </div>
            )}
            {!isChartLoading && !chartFetchError && activeChartRows.length === 0 && (
              <div className="chart-overlay" role="status">
                <p>No chart data available for this range.</p>
              </div>
            )}
          </div>
        </div>
        <aside className="technical-side-column">
          <section className={`technical-score-card tone-${technicalScoreTone}`}>
            <h3>Technical Score</h3>
            <div className={`technical-score-meter-wrap zone-${technicalScoreZone}`}>
              <div className="technical-score-meter-head">
                <span className="technical-score-signal">{technicalSignalLabel}</span>
                <strong className="technical-score-value">{formatScore(result.score)}</strong>
              </div>
              <div className="technical-score-meter-visual" aria-hidden="true">
                <div className="technical-score-meter-track">
                  <div className="technical-score-meter-segments">
                    <span className="segment strong-bearish" />
                    <span className="segment bearish" />
                    <span className="segment neutral" />
                    <span className="segment bullish" />
                    <span className="segment strong-bullish" />
                  </div>
                  <span
                    className="technical-score-meter-marker"
                    style={{ left: `${technicalScorePercent}%` }}
                  />
                </div>
                <div className="technical-score-meter-scale">
                  {[0, 25, 50, 75, 100].map((tick) => (
                    <span
                      key={`score-tick-${tick}`}
                      className={`technical-score-meter-tick${tick === 0 ? ' edge-start' : ''}${tick === 100 ? ' edge-end' : ''}`}
                      style={{ left: `${tick}%` }}
                    >
                      <span className="technical-score-meter-tick-mark" />
                      <span className="technical-score-meter-tick-label">{tick}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </section>
          <section className="technical-data-card">
            <h3>Data used</h3>
            <MetricList
              rows={[
                ['Trend Direction', safeText(result.trend)],
                ['RSI (14)', formatNumber(data.rsi)],
                ['MACD Signal', formatNumber(indicators?.MACD_signal)],
                ['ADX (Trend Strength)', formatNumber(indicators?.ADX)],
                ['20D Moving Average', formatCurrency(data.sma20, technicalCurrency)],
                ['50D Moving Average', formatCurrency(data.sma50, technicalCurrency)],
                ['200D Moving Average', formatCurrency(indicators?.SMA200, technicalCurrency)],
                ['Support Level', formatPrimaryLevel(structure?.support, technicalCurrency)],
                ['Resistance Level', formatPrimaryLevel(structure?.resistance, technicalCurrency)],
              ]}
            />
          </section>
        </aside>
      </div>
      <section
        ref={snapshotSectionRef}
        className="technical-snapshot-section"
        aria-label="Technical snapshot"
      >
        <div className="technical-snapshot-panels">
          <article className="snapshot-panel">
            <header className="snapshot-panel-head">
              <h4>Technical Snapshot</h4>
              <span className={`snapshot-badge tone-${movingAverageAlignment.tone}`}>
                {movingAverageAlignment.label}
              </span>
            </header>
            <div className="snapshot-tiles-grid">
              {snapshotTiles.map((tile, index) => (
                <SnapshotMetricTile
                  key={tile.key}
                  tile={tile}
                  index={index}
                  isAnimated={isSnapshotInView}
                />
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
                    className={`price-range-marker kind-${marker.kind} anchor-${marker.anchor} ${index % 2 === 0 ? 'above' : 'below'}${showPriceRangeMarkers ? ' is-animated' : ''}`}
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
                        {formatCurrency(marker.value, technicalCurrency)}
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
                      <strong>{formatCurrency(row.value, technicalCurrency)}</strong>
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
                      <IndicatorMiniSparkline chart={chart} isAnimated={isSnapshotInView} />
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
  const HEADLINES_BATCH_SIZE = 15
  const [headlineQuery, setHeadlineQuery] = useState('')
  const [headlineToneFilter, setHeadlineToneFilter] = useState<
    'all' | 'positive' | 'neutral' | 'negative'
  >('all')
  const [visibleHeadlineCount, setVisibleHeadlineCount] = useState(HEADLINES_BATCH_SIZE)

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
  const sentimentScorePercent = isFiniteNumber(result.score)
    ? clampPercent(result.score)
    : 50
  const sentimentScoreZone = isFiniteNumber(result.score)
    ? result.score < 30
      ? 'strong-bearish'
      : result.score < 45
        ? 'bearish'
        : result.score < 55
          ? 'neutral'
          : result.score < 70
            ? 'bullish'
            : 'strong-bullish'
    : 'neutral'
  const sentimentSignalLabel = isFiniteNumber(result.score)
    ? result.score < 30
      ? 'Very Negative'
      : result.score < 45
        ? 'Negative'
        : result.score < 55
          ? 'Mixed'
          : result.score < 70
            ? 'Positive'
            : 'Very Positive'
    : 'N/A'
  const sentimentCounts = headlines.reduce(
    (counts, headline) => {
      const tone = sentimentSignalTone(headline.sentiment)
      counts[tone] += 1
      return counts
    },
    {
      positive: 0,
      neutral: 0,
      negative: 0,
    } as Record<'positive' | 'neutral' | 'negative', number>,
  )
  const filteredHeadlines = useMemo(() => {
    const query = headlineQuery.trim().toLowerCase()
    return headlines.filter((headline) => {
      const tone = sentimentSignalTone(headline.sentiment)
      if (headlineToneFilter !== 'all' && tone !== headlineToneFilter) {
        return false
      }
      if (!query) {
        return true
      }
      const title = (headline.title || '').toLowerCase()
      const source = (headline.source || headline.apiSource || '').toLowerCase()
      return title.includes(query) || source.includes(query)
    })
  }, [headlineQuery, headlineToneFilter, headlines])
  const visibleHeadlines = filteredHeadlines.slice(0, visibleHeadlineCount)
  const hasMoreHeadlines = visibleHeadlineCount < filteredHeadlines.length

  return (
    <article className="panel reveal">
      <header className="panel-head">
        <h2>Sentiment Analysis</h2>
        <span className="score-tag">{formatScore(result.score)}</span>
      </header>
      {sentimentSummary.insights.length > 0 || sentimentSummary.summary ? (
        <div className="sentiment-summary">
          {sentimentSummary.insights.length > 0 && (
            <section className="sentiment-summary-card">
              <h3>Main Insights from news headlines</h3>
              <ul className="analysis-bullets">
                {sentimentSummary.insights.map((item, index) => (
                  <li key={`${item}-${index}`}>{item}</li>
                ))}
              </ul>
            </section>
          )}
          {sentimentSummary.summary && (
            <section className="sentiment-summary-card">
              <h3>Summary</h3>
              <p className="analysis-copy">{sentimentSummary.summary}</p>
            </section>
          )}
        </div>
      ) : (
        <p className="analysis-copy">{summary}</p>
      )}
      <div className="sentiment-metrics-grid">
        <section className="sentiment-summary-card sentiment-overview-card">
          <div className="sentiment-overview-split">
            <dl className="sentiment-count-list sentiment-counts-panel">
              <div>
                <dt>Positive headlines</dt>
                <dd>{sentimentCounts.positive}</dd>
              </div>
              <div>
                <dt>Neutral headlines</dt>
                <dd>{sentimentCounts.neutral}</dd>
              </div>
              <div>
                <dt>Negative headlines</dt>
                <dd>{sentimentCounts.negative}</dd>
              </div>
            </dl>
            <div className="sentiment-meter-wrap">
              <h3 className="sentiment-meter-title">Sentiment Score</h3>
              <div
                className={`technical-score-meter-wrap zone-${sentimentScoreZone}`}
                aria-label={`Overall sentiment score ${formatScore(result.score)} (${sentimentSignalLabel})`}
                role="img"
              >
                <div className="technical-score-meter-head">
                  <span className="technical-score-signal">{sentimentSignalLabel}</span>
                  <strong className="technical-score-value">{formatScore(result.score)}</strong>
                </div>
                <div className="technical-score-meter-visual" aria-hidden="true">
                  <div className="technical-score-meter-track">
                    <div className="technical-score-meter-segments">
                      <span className="segment strong-bearish" />
                      <span className="segment bearish" />
                      <span className="segment neutral" />
                      <span className="segment bullish" />
                      <span className="segment strong-bullish" />
                    </div>
                    <span
                      className="technical-score-meter-marker"
                      style={{ left: `${sentimentScorePercent}%` }}
                    />
                  </div>
                  <div className="technical-score-meter-scale">
                    {[0, 25, 50, 75, 100].map((tick) => (
                      <span
                        key={`sentiment-tick-${tick}`}
                        className={`technical-score-meter-tick${tick === 0 ? ' edge-start' : ''}${tick === 100 ? ' edge-end' : ''}`}
                        style={{ left: `${tick}%` }}
                      >
                        <span className="technical-score-meter-tick-mark" />
                        <span className="technical-score-meter-tick-label">{tick}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="headline-filters">
        <input
          className="headline-search-input"
          value={headlineQuery}
          onChange={(event) => {
            setHeadlineQuery(event.target.value)
            setVisibleHeadlineCount(HEADLINES_BATCH_SIZE)
          }}
          placeholder="Search headlines or source"
          aria-label="Search headlines"
        />
        <div className="headline-tone-filter" role="group" aria-label="Filter headlines">
          {[
            { key: 'all', label: 'All' },
            { key: 'positive', label: 'Positive' },
            { key: 'neutral', label: 'Neutral' },
            { key: 'negative', label: 'Negative' },
          ].map((option) => (
            <button
              key={option.key}
              type="button"
              className={headlineToneFilter === option.key ? 'active' : ''}
              onClick={() => {
                setHeadlineToneFilter(
                  option.key as 'all' | 'positive' | 'neutral' | 'negative',
                )
                setVisibleHeadlineCount(HEADLINES_BATCH_SIZE)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="headline-filter-count">
          Showing {Math.min(visibleHeadlines.length, filteredHeadlines.length)} of{' '}
          {filteredHeadlines.length} filtered headlines
        </p>
      </div>

      <div className="headline-list">
        {headlines.length === 0 && <p>No headlines returned from the news sources.</p>}
        {headlines.length > 0 && filteredHeadlines.length === 0 && (
          <p>No headlines match the current filters.</p>
        )}
        {visibleHeadlines.map((headline, index) => {
          const signalTone = sentimentSignalTone(headline.sentiment)
          const sentimentLabel = formatHeadlineSentimentLabel(headline.sentiment)
          const confidenceLabel = formatHeadlineConfidence(headline.sentimentScore)
          return (
            <article className="headline-item" key={`${headline.title}-${index}`}>
              <div className="headline-row">
                {headline.link ? (
                  <a href={headline.link} target="_blank" rel="noreferrer">
                    {headline.title}
                  </a>
                ) : (
                  <p>{headline.title}</p>
                )}
                <div className="headline-meta">
                  <span
                    className={`headline-signal tone-${signalTone}`}
                    aria-label={`${sentimentLabel} sentiment, confidence ${confidenceLabel}`}
                    title={`${sentimentLabel} sentiment, confidence ${confidenceLabel}`}
                  >
                    <span className="headline-signal-label">{sentimentLabel}</span>
                    <span className="headline-signal-confidence">{confidenceLabel}</span>
                  </span>
                  <span className="headline-time">
                    {formatHeadlineTimestamp(resolveHeadlineTimestamp(headline))}
                  </span>
                </div>
              </div>
            </article>
          )
        })}
        {hasMoreHeadlines && (
          <div className="headline-actions">
            <button
              type="button"
              className="headline-show-more"
              onClick={() =>
                setVisibleHeadlineCount((count) => count + HEADLINES_BATCH_SIZE)
              }
            >
              Show more
            </button>
          </div>
        )}
      </div>
    </article>
  )
}

function SnapshotMetricTile({
  tile,
  index,
  isAnimated,
}: {
  tile: TechnicalSnapshotRow
  index: number
  isAnimated: boolean
}) {
  const animatedValue = useAnimatedNumber(tile.numeric?.value ?? null, 1200, isAnimated)
  const animatedProgress = useAnimatedNumber(tile.progressPercent, 1200, isAnimated)
  const valueLabel =
    tile.numeric && isFiniteNumber(animatedValue)
      ? formatAnimatedSnapshotValue(animatedValue, tile.numeric)
      : tile.value

  return (
    <article
      className={`snapshot-tile tone-${tile.tone}${isAnimated ? ' snapshot-tile-enter' : ''}`}
      style={isAnimated ? { animationDelay: `${80 + index * 45}ms` } : undefined}
    >
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

function IndicatorMiniSparkline({
  chart,
  isAnimated,
}: {
  chart: IndicatorMiniChart
  isAnimated: boolean
}) {
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
          isAnimationActive={isAnimated}
          animationDuration={1400}
          animationEasing="ease-in-out"
          dot={(dotProps) => (
            <IndicatorMiniPoint dotProps={dotProps} stroke={chart.stroke} isAnimated={isAnimated} />
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
  isAnimated,
}: {
  dotProps: {
    cx?: number
    cy?: number
    payload?: IndicatorMiniSeriesPoint
  }
  stroke: string
  isAnimated: boolean
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
      className={`indicator-mini-point${isAnimated ? ' is-animated' : ''}`}
      style={isAnimated ? { animationDelay: `${80 + (payload?.index ?? 0) * 22}ms` } : undefined}
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

function FullReportSection({ analysis, isGeneratingReport }: { analysis: AnalysisResponse, isGeneratingReport?: boolean }) {
  const reportText = normalizeInlineBulletLists(
    emphasizeSummaryLabel(analysis.report?.trim() ?? ''),
  )

  if (isGeneratingReport && !reportText) {
    return (
      <article className="panel reveal">
        <header className="panel-head">
          <h2>FULL REPORT</h2>
        </header>
        <div className="full-report-markdown">
          <p className="analysis-copy"><em>Generating Summary...</em></p>
        </div>
      </article>
    )
  }

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
  ticker: string,
  isGeneratingReport: boolean = false,
) {
  const llmSections: Partial<ReportSections> = analysis.reportSections ?? {}
  const displayCurrency = resolveAnalysisCurrency(analysis)
  
  const getLlmSummary = (key: keyof ReportSections): string | undefined => {
    if (llmSections[key]) return llmSections[key]
    if (isGeneratingReport) return 'Generating Summary...'
    return undefined
  }

  switch (tab) {
    case 'fundamental':
      return (
        <FundamentalSection
          result={analysis.fundamental}
          llmSummary={getLlmSummary('fundamental')}
          displayCurrency={displayCurrency}
        />
      )
    case 'technical':
      return (
        <TechnicalSection
          result={analysis.technical}
          llmSummary={getLlmSummary('technical')}
          ticker={ticker}
          companyName={
            analysis.fundamental?.data?.shortName ??
            analysis.fundamental?.data?.longName ??
            ''
          }
          beta={analysis.fundamental?.data?.beta ?? null}
          displayCurrency={displayCurrency}
        />
      )
    case 'sentiment':
      return (
        <SentimentSection
          result={analysis.sentiment}
          llmSummary={getLlmSummary('sentiment')}
        />
      )
    case 'full-report':
      // Show full report section, but if generating, maybe we can wait or show a placeholder in FullReportSection 
      // FullReportSection receives analysis which already has report as undefined, so it might say unavailable. 
      // We will handle FullReportSection below if needed.
      return <FullReportSection analysis={analysis} isGeneratingReport={isGeneratingReport} />
    case 'overview':
    default:
      return (
        <OverviewSection
          overview={analysis.overview}
          llmSummary={getLlmSummary('overall')}
          technical={analysis.technical}
          sentiment={analysis.sentiment}
          sentimentLlm={getLlmSummary('sentiment')}
          ticker={ticker}
          displayCurrency={displayCurrency}
        />
      )
  }
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
  if (/^\/login\/?$/i.test(pathname)) {
    return { type: 'auth', mode: 'login' }
  }

  if (/^\/signup\/?$/i.test(pathname)) {
    return { type: 'auth', mode: 'signup' }
  }

  if (/^\/compare\/?$/i.test(pathname)) {
    return { type: 'compare' }
  }

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

function ColoredValue({ value, formatFn }: { value: number | null | undefined, formatFn: (v: number | null | undefined) => string }) {
  const isNa = typeof value !== 'number'
  const text = formatFn(value)
  if (isNa) {
    return <span>{text}</span>
  }
  
  if ((value as number) > 0) {
    return <span className="val-positive">{text}</span>
  } else if ((value as number) < 0) {
    return <span className="val-negative">{text}</span>
  }
  return <span>{text}</span>
}



function formatPercent(value: number | null | undefined): string {
  if (typeof value !== 'number') {
    return 'N/A'
  }
  return `${(value * 100).toFixed(2)}%`
}

function normalizeCurrencyCode(currency: string | null | undefined): string {
  if (!currency) {
    return 'USD'
  }
  const normalized = currency.trim().toUpperCase()
  return normalized || 'USD'
}

function getCurrencyFormatter(currency: string): Intl.NumberFormat | null {
  const normalized = normalizeCurrencyCode(currency)
  const cached = currencyFormatterCache.get(normalized)
  if (cached) {
    return cached
  }
  try {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalized,
      maximumFractionDigits: 2,
    })
    currencyFormatterCache.set(normalized, formatter)
    return formatter
  } catch {
    return null
  }
}

function formatCurrency(
  value: number | null | undefined,
  currency: string,
): string {
  if (!isFiniteNumber(value)) {
    return 'N/A'
  }
  const normalized = normalizeCurrencyCode(currency)
  const formatter = getCurrencyFormatter(normalized)
  if (formatter) {
    return formatter.format(value)
  }
  return `${decimalFormatter.format(value)} ${normalized}`
}

function formatPrimaryLevel(
  levels: number[] | null | undefined,
  currency: string,
): string {
  if (!Array.isArray(levels) || levels.length === 0) {
    return 'N/A'
  }
  const first = levels.find((level) => typeof level === 'number' && Number.isFinite(level))
  if (typeof first !== 'number') {
    return 'N/A'
  }
  return formatCurrency(first, currency)
}

function resolveAnalysisCurrency(analysis: AnalysisResponse): string {
  const fundamentalCurrency = analysis.fundamental?.data?.currency
  const technicalCurrency =
    analysis.technical?.data?.currency ?? analysis.technical?.currency
  return normalizeCurrencyCode(fundamentalCurrency ?? technicalCurrency)
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
    currency?: string
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

function useAnimatedNumber(
  target: number | null,
  durationMs: number,
  shouldAnimate = true,
): number | null {
  const [animated, setAnimated] = useState(0)

  useEffect(() => {
    if (!isFiniteNumber(target)) {
      setAnimated(0)
      return
    }

    if (!shouldAnimate) {
      setAnimated(0)
      return
    }

    let frame = 0
    const startValue = 0
    const startTime = performance.now()

    const step = (timestamp: number) => {
      const elapsed = timestamp - startTime
      const progress = Math.min(1, elapsed / durationMs)
      const eased =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - ((-2 * progress + 2) ** 3) / 2
      setAnimated(startValue + (target - startValue) * eased)
      if (progress < 1) {
        frame = requestAnimationFrame(step)
      }
    }

    setAnimated(0)
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [target, durationMs, shouldAnimate])

  return isFiniteNumber(target) ? animated : null
}

function useInViewOnce<T extends Element>(
  ref: React.RefObject<T | null>,
  options?: IntersectionObserverInit,
): boolean {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    if (isVisible) {
      return
    }

    const node = ref.current
    if (!node) {
      return
    }

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
          break
        }
      }
    }, options)

    observer.observe(node)
    return () => observer.disconnect()
  }, [isVisible, options, ref])

  return isVisible
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
    return formatCurrency(value, numeric.currency ?? 'USD')
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

function sentimentSignalTone(value: string | undefined): 'positive' | 'neutral' | 'negative' {
  const normalized = (value ?? '').trim().toLowerCase()
  if (normalized.includes('positive') || normalized.includes('bullish')) {
    return 'positive'
  }
  if (normalized.includes('negative') || normalized.includes('bearish')) {
    return 'negative'
  }
  return 'neutral'
}

function formatHeadlineSentimentLabel(value: string | undefined): string {
  const tone = sentimentSignalTone(value)
  if (tone === 'positive') {
    return 'Positive'
  }
  if (tone === 'negative') {
    return 'Negative'
  }
  return 'Neutral'
}

function formatHeadlineConfidence(value: unknown): string {
  if (!isFiniteNumber(value)) {
    return 'N/A'
  }
  const percent = Math.max(0, Math.min(100, value * 100))
  return `${percent.toFixed(1)}%`
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

  // Strict bullet boundary: only ". -", ".-", and line-start "- ".
  const normalizedText = text.replace(/\. ?(?=-\s+\S)/g, '.\n')
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
): TechnicalData {
  const legacy = result.data
  const indicators = result.indicators

  return {
    symbol: legacy?.symbol ?? result.symbol ?? '',
    currency: legacy?.currency ?? result.currency,
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

