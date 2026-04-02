import { forwardRef } from 'react'
import type { AnalysisResponse } from '../types'
import './PdfReportTemplate.css'

/* ─── Helpers ──────────────────────────────────────────────────────── */

function isFinite_(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 2,
})

const decimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

function fmtCurrency(v: number | null | undefined, c: string): string {
  if (!isFinite_(v)) return 'N/A'
  const code = (c || 'USD').trim().toUpperCase() || 'USD'
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 2,
    }).format(v)
  } catch {
    return `${decimal.format(v)} ${code}`
  }
}

function fmtCompactCurrency(v: number | null | undefined, c: string): string {
  if (!isFinite_(v)) return 'N/A'
  const code = (c || 'USD').trim().toUpperCase() || 'USD'
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(v)
  } catch {
    return `${compact.format(v)} ${code}`
  }
}

function fmtNum(v: number | null | undefined): string {
  if (!isFinite_(v)) return 'N/A'
  return decimal.format(v)
}

function fmtPercent(v: number | null | undefined): string {
  if (!isFinite_(v)) return 'N/A'
  return `${(v * 100).toFixed(2)}%`
}

function fmtSigned(v: number): string {
  return `${v >= 0 ? '+' : ''}${decimal.format(v)}`
}

function fmtSignedPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`
}



function normSharePct(v: number | null | undefined): number {
  if (!isFinite_(v)) return 0
  return v <= 1 ? v * 100 : v
}

function sanitize(raw: string | null | undefined): string {
  if (!raw) return ''
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractBullets(text: string): string[] {
  if (!text) return []
  const lines = text
    .replace(/\\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const bullets: string[] = []
  for (const line of lines) {
    const cleaned = line.replace(/^[-–•*]\s*/, '').replace(/^\d+[.)]\s*/, '').trim()
    if (cleaned.length > 8) bullets.push(cleaned)
  }
  return bullets
}

function summarize(raw: string | null | undefined, fallback: string): string {
  const cleaned = sanitize(raw)
  return cleaned || fallback
}

function buildSummaryPoints(raw: string | null | undefined, fallback: string): string[] {
  const fromBullets = raw
    ? extractBullets(raw).map(sanitize).filter(Boolean)
    : []
  if (fromBullets.length > 0) return fromBullets.slice(0, 4)
  const cleaned = sanitize(raw)
  if (cleaned) {
    const sentences = cleaned.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean).slice(0, 4)
    if (sentences.length > 0) return sentences
  }
  return [fallback]
}

function buildRiskItems(raw: string | null | undefined): string[] {
  const bullets = raw ? extractBullets(raw).map(sanitize).filter(Boolean).slice(0, 6) : []
  if (bullets.length > 0) return bullets
  const cleaned = sanitize(raw)
  if (cleaned) {
    const sentences = cleaned.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean).slice(0, 6)
    if (sentences.length > 0) return sentences
  }
  return [
    'Supply-chain concentration can amplify cost and delivery shocks.',
    'Regulatory and legal developments may pressure valuation multiples.',
    'Execution risk increases when demand slows in core segments.',
    'Macroeconomic headwinds, including interest rate changes and inflation, may affect growth.',
  ]
}

function toneFromVerdict(v: string): string {
  const lc = v.toLowerCase()
  if (lc === 'buy') return 'positive'
  if (lc === 'sell') return 'negative'
  return 'neutral'
}

function resolveScoreZone(s: number | null): string {
  if (!isFinite_(s)) return 'neutral'
  if (s < 30) return 'strong-bearish'
  if (s < 45) return 'bearish'
  if (s < 55) return 'neutral'
  if (s < 70) return 'bullish'
  return 'strong-bullish'
}



function inferExchange(input: {
  ticker: string
  symbol?: string | null
  exchange?: string | null
  fullExchangeName?: string | null
}): string {
  const direct = `${input.fullExchangeName ?? input.exchange ?? ''}`.trim().toUpperCase()
  if (direct) {
    if (direct.includes('NASDAQ') || direct === 'NMS' || direct === 'NGM' || direct === 'NCM') return 'NASDAQ'
    if (direct.includes('NEW YORK') || direct === 'NYQ' || direct === 'NYSE') return 'NYSE'
    if (direct.includes('NSE') || direct === 'NSI') return 'NSE'
    if (direct.includes('BSE')) return 'BSE'
    return direct
  }
  const sym = (input.symbol || input.ticker || '').trim().toUpperCase()
  if (sym.endsWith('.NS')) return 'NSE'
  if (sym.endsWith('.BO')) return 'BSE'
  if (sym.endsWith('.L')) return 'LSE'
  return 'N/A'
}

/* ─── SVG Gauge Component ──────────────────────────────────────────── */

function GaugeSvg({ score, size = 100 }: { score: number | null; size?: number }) {
  const s = isFinite_(score) ? score : 50
  const zone = resolveScoreZone(score)

  // Semicircular gauge
  const cx = size / 2
  const cy = size / 2 + 4
  const r = size / 2 - 10
  const startAngle = Math.PI
  const endAngle = 0
  const sweepAngle = startAngle - endAngle

  // Needle angle based on score (0–100 mapped to 180°–0°)
  const needleAngle = startAngle - (s / 100) * sweepAngle
  const needleLen = r - 6
  const nx = cx + needleLen * Math.cos(needleAngle)
  const ny = cy - needleLen * Math.sin(needleAngle)

  // Zone colors
  const zones = [
    { start: 0, end: 0.20, color: '#ef4444' },
    { start: 0.20, end: 0.40, color: '#f97316' },
    { start: 0.40, end: 0.60, color: '#eab308' },
    { start: 0.60, end: 0.80, color: '#22c55e' },
    { start: 0.80, end: 1.0, color: '#16a34a' },
  ]

  const arcPath = (startFrac: number, endFrac: number) => {
    const a1 = startAngle - startFrac * sweepAngle
    const a2 = startAngle - endFrac * sweepAngle
    const x1 = cx + r * Math.cos(a1)
    const y1 = cy - r * Math.sin(a1)
    const x2 = cx + r * Math.cos(a2)
    const y2 = cy - r * Math.sin(a2)
    const large = (endFrac - startFrac) > 0.5 ? 1 : 0
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
  }

  const zoneColor =
    zone === 'strong-bearish' ? '#ef4444'
      : zone === 'bearish' ? '#f97316'
        : zone === 'neutral' ? '#eab308'
          : zone === 'bullish' ? '#22c55e'
            : '#16a34a'

  return (
    <svg width={size} height={size / 2 + 20} viewBox={`0 0 ${size} ${size / 2 + 20}`}>
      {zones.map((z, i) => (
        <path
          key={i}
          d={arcPath(z.start, z.end)}
          fill="none"
          stroke={z.color}
          strokeWidth={8}
          strokeLinecap="butt"
          opacity={0.3}
        />
      ))}
      {/* Active zone highlight */}
      <path
        d={arcPath(0, s / 100)}
        fill="none"
        stroke={zoneColor}
        strokeWidth={8}
        strokeLinecap="round"
      />
      {/* Needle */}
      <line
        x1={cx}
        y1={cy}
        x2={nx}
        y2={ny}
        stroke="#1e293b"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <circle cx={cx} cy={cy} r={4} fill="#1e293b" />
      {/* Score text */}
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize="16" fontWeight="700" fill="#1e293b">
        {isFinite_(score) ? score.toFixed(1) : 'N/A'}
      </text>
    </svg>
  )
}

/* ─── SVG Donut Chart ──────────────────────────────────────────────── */

function DonutSvg({ institutional, retail, promoter, size = 110 }: {
  institutional: number; retail: number; promoter: number; size?: number
}) {
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 6
  const circumference = 2 * Math.PI * r

  const total = institutional + retail + promoter
  if (total <= 0) return null

  const instPct = institutional / total
  const retailPct = retail / total
  const promoterPct = promoter / total

  const instLen = instPct * circumference
  const retailLen = retailPct * circumference
  const promoterLen = promoterPct * circumference

  const instOffset = 0
  const retailOffset = -(instLen)
  const promoterOffset = -(instLen + retailLen)

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Promoter (bottom layer) */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#d8dfee" strokeWidth={14}
        strokeDasharray={`${promoterLen} ${circumference - promoterLen}`}
        strokeDashoffset={promoterOffset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {/* Retail */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#afc1ff" strokeWidth={14}
        strokeDasharray={`${retailLen} ${circumference - retailLen}`}
        strokeDashoffset={retailOffset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {/* Institutional */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#0c4ab8" strokeWidth={14}
        strokeDasharray={`${instLen} ${circumference - instLen}`}
        strokeDashoffset={instOffset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {/* Center text */}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="14" fontWeight="700" fill="#1e293b">
        {Math.round(institutional)}%
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize="8" fill="#64748b">
        Institutional
      </text>
    </svg>
  )
}

/* ─── Revenue Bars SVG ─────────────────────────────────────────────── */

type RevRow = { label: string; revH: number; profH: number; rev: number | null; prof: number | null }

function buildRevenueRows(trend: AnalysisResponse['fundamental']): RevRow[] {
  const data = trend?.data?.revenueTrend
  const fallback: RevRow[] = [
    { label: '2021', revH: 42, profH: 12, rev: null, prof: null },
    { label: '2022', revH: 58, profH: 15, rev: null, prof: null },
    { label: '2023', revH: 74, profH: 18, rev: null, prof: null },
    { label: '2024E', revH: 90, profH: 23, rev: null, prof: null },
  ]
  if (!data || data.length === 0) return fallback

  const recent = data.slice(-5)
  const max = recent.reduce((m, r) => {
    const rv = isFinite_(r.revenue) && r.revenue > 0 ? r.revenue : 0
    const pf = isFinite_(r.netProfit) && r.netProfit > 0 ? r.netProfit : 0
    return Math.max(m, rv, pf)
  }, 0)
  if (max <= 0) return fallback

  return recent.map((r, i) => {
    const revH = isFinite_(r.revenue) && r.revenue > 0 ? Math.max(8, (r.revenue / max) * 100) : 0
    const profH = isFinite_(r.netProfit) && r.netProfit > 0 ? Math.max(5, (r.netProfit / max) * 100) : 0
    return {
      label: i === recent.length - 1 ? `${r.year}E` : `${r.year}`,
      revH,
      profH,
      rev: isFinite_(r.revenue) ? r.revenue : null,
      prof: isFinite_(r.netProfit) ? r.netProfit : null,
    }
  })
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  Main PDF Report Template                                         */
/* ═══════════════════════════════════════════════════════════════════ */

export interface PdfReportTemplateProps {
  analysis: AnalysisResponse
}

export const PdfReportTemplate = forwardRef<HTMLDivElement, PdfReportTemplateProps>(
  function PdfReportTemplate({ analysis }, ref) {
    const fd = analysis.fundamental?.data
    const tech = analysis.technical
    const sections = analysis.reportSections ?? {}
    const currency = ((fd?.currency ?? tech?.data?.currency ?? tech?.currency) || 'USD').trim().toUpperCase() || 'USD'

    const companyName = fd?.shortName ?? fd?.longName ?? analysis.ticker
    const exchange = inferExchange({
      ticker: analysis.ticker,
      symbol: fd?.symbol,
      exchange: fd?.exchange,
      fullExchangeName: fd?.fullExchangeName,
    })

    // Price
    const latestPrice = fd?.currentPrice ?? tech?.data?.lastClose ?? tech?.indicators?.close ?? null
    const ohlcv = tech?.data?.ohlcv ?? tech?.ohlcv ?? []
    let prevClose: number | null = null
    if (ohlcv.length >= 2) {
      const p = ohlcv[ohlcv.length - 2]?.close
      if (isFinite_(p)) prevClose = p
    }
    const priceChange = isFinite_(latestPrice) && isFinite_(prevClose) ? latestPrice - prevClose : null
    const priceChangePct = isFinite_(priceChange) && isFinite_(prevClose) && prevClose !== 0 ? (priceChange / prevClose) * 100 : null
    const priceTone = !isFinite_(priceChange) ? 'neutral' : priceChange >= 0 ? 'positive' : 'negative'

    // Consensus
    const consensusRaw = (fd?.recommendationKey ?? analysis.overview.verdict ?? 'N/A').trim()
    const consensus = consensusRaw ? consensusRaw.toUpperCase() : 'N/A'
    const consensusTone = toneFromVerdict(consensusRaw)
    const targetPrice = fmtCurrency(fd?.targetMeanPrice, currency)
    const marketCap = fmtCompactCurrency(fd?.marketCap, currency)

    // Executive briefing
    const executive = summarize(
      sections.overall ?? analysis.report,
      'Overview summary is currently unavailable.',
    )

    // Revenue
    const revenueRows = buildRevenueRows(analysis.fundamental)

    // Performance metrics
    const metrics = [
      { label: 'P/E Ratio (TTM)', value: fmtNum(fd?.trailingPE) },
      { label: 'Dividend Yield', value: fmtPercent(fd?.dividendYield) },
      { label: 'EPS (Diluted)', value: fmtCurrency(fd?.trailingEps, currency) },
      { label: 'ROE', value: fmtPercent(fd?.returnOnEquity) },
      { label: 'Beta (5Y)', value: fmtNum(fd?.beta) },
      { label: 'Operating Margin', value: fmtPercent(fd?.operatingMargins) },
      { label: 'Debt / Equity', value: fmtNum(fd?.debtToEquity) },
    ]

    // Shareholding
    const instRaw = normSharePct(fd?.shareholdingPattern?.institutions)
    const retailRaw = normSharePct(fd?.shareholdingPattern?.public)
    const promoterRaw = normSharePct(fd?.shareholdingPattern?.promoters)
    const shareTotal = instRaw + retailRaw + promoterRaw
    const inst = shareTotal > 0 ? (instRaw / shareTotal) * 100 : 60.2
    const retail = shareTotal > 0 ? (retailRaw / shareTotal) * 100 : 25.4
    const promoter = shareTotal > 0 ? (promoterRaw / shareTotal) * 100 : 14.4

    // Ownership insights
    const ownershipRows = [
      { label: 'Institutional', value: `${inst.toFixed(1)}%` },
      { label: 'Retail / Public', value: `${retail.toFixed(1)}%` },
      { label: 'Promoter', value: `${promoter.toFixed(1)}%` },
      { label: 'Analyst Coverage', value: isFinite_(fd?.numberOfAnalystOpinions) ? `${Math.round(fd.numberOfAnalystOpinions)} Analysts` : 'N/A' },
    ]

    // Scores
    const fundScore = isFinite_(analysis.fundamental?.score) ? analysis.fundamental!.score : (isFinite_(analysis.overview.fundamentalScore) ? analysis.overview.fundamentalScore : null)
    const techScore = isFinite_(analysis.technical?.score) ? analysis.technical!.score : (isFinite_(analysis.overview.technicalScore) ? analysis.overview.technicalScore : null)
    const sentScore = isFinite_(analysis.sentiment?.score) ? analysis.sentiment!.score : (isFinite_(analysis.overview.sentimentScore) ? analysis.overview.sentimentScore : null)

    // Summary points
    const fundPoints = buildSummaryPoints(sections.fundamental, 'Fundamental analysis summary unavailable.')
    const techPoints = buildSummaryPoints(sections.technical, 'Technical analysis summary unavailable.')
    const sentPoints = buildSummaryPoints(sections.sentiment, 'Sentiment analysis summary unavailable.')

    // Risk factors
    const riskItems = buildRiskItems(sections.riskFactors ?? sections.conclusion)

    // Date
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

    return (
      <div ref={ref} className="pdf-report-root">
        {/* ── HEADER ── */}
        <div className="pdf-header">
          <div className="pdf-header-left">
            <span className="pdf-header-company">{companyName} ({analysis.ticker})</span>
            <span className="pdf-header-exchange">{exchange}</span>
          </div>
          <div className="pdf-header-center">
            <span className="pdf-header-price">
              {isFinite_(latestPrice) ? fmtCurrency(latestPrice, currency) : 'N/A'}
            </span>
            {isFinite_(priceChange) && isFinite_(priceChangePct) && (
              <span className={`pdf-header-change ${priceTone}`}>
                {priceTone === 'negative' ? '▼' : '▲'} {fmtSigned(priceChange)} ({fmtSignedPct(priceChangePct)})
              </span>
            )}
          </div>
          <div className="pdf-header-right">
            <div className="pdf-header-stat">
              <span className="label">Market Cap</span>
              <span className="value">{marketCap}</span>
            </div>
            <div className="pdf-header-stat">
              <span className="label">Analyst Consensus</span>
              <span className={`pdf-consensus-chip tone-${consensusTone}`}>
                {consensus} <span className="pdf-consensus-icon" />
              </span>
            </div>
            <div className="pdf-header-stat">
              <span className="label">Target Price</span>
              <span className="value">{targetPrice}</span>
            </div>
          </div>
        </div>

        {/* ── EXECUTIVE BRIEFING ── */}
        <div className="pdf-executive">
          <h3>Executive Briefing</h3>
          <p>{executive}</p>
        </div>

        {/* ── REVENUE & METRICS ROW ── */}
        <div className="pdf-mid-grid">
          <div className="pdf-revenue-section">
            <h4>Revenue &amp; Profit Trend</h4>
            <div className="pdf-revenue-chart">
              {revenueRows.map((row, i) => (
                <div key={i} className="pdf-revenue-col">
                  <div className="pdf-revenue-bar-group">
                    <div className="pdf-revenue-bar" style={{ height: `${row.revH}%` }} />
                    <div className="pdf-profit-bar" style={{ height: `${row.profH}%` }} />
                  </div>
                  <span className="pdf-revenue-year">{row.label}</span>
                </div>
              ))}
            </div>
            <div className="pdf-revenue-legend">
              <span><i className="revenue" />Revenue</span>
              <span><i className="profit" />Net Profit</span>
            </div>
          </div>

          <div className="pdf-metrics-section">
            <h4>Key Performance Metrics</h4>
            <table className="pdf-metrics-table">
              <tbody>
                {metrics.map((m) => (
                  <tr key={m.label}>
                    <td>{m.label}</td>
                    <td>{m.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── SHAREHOLDING & OWNERSHIP ROW ── */}
        <div className="pdf-mid-grid">
          <div className="pdf-share-section">
            <h4>Shareholding Pattern</h4>
            <div className="pdf-share-content">
              <div className="pdf-share-ring-wrap">
                <DonutSvg institutional={inst} retail={retail} promoter={promoter} size={100} />
              </div>
              <ul className="pdf-share-legend">
                <li>
                  <i className="institutional" />
                  <span>Institutional</span>
                  <strong>{inst.toFixed(1)}%</strong>
                </li>
                <li>
                  <i className="retail" />
                  <span>Retail / Public</span>
                  <strong>{retail.toFixed(1)}%</strong>
                </li>
                <li>
                  <i className="promoter" />
                  <span>Promoter</span>
                  <strong>{promoter.toFixed(1)}%</strong>
                </li>
              </ul>
            </div>
          </div>

          <div className="pdf-ownership-section">
            <h4>Ownership Insights</h4>
            <table className="pdf-ownership-table">
              <tbody>
                {ownershipRows.map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td>{r.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── THREE SUMMARY GAUGES ── */}
        <div className="pdf-summary-grid">
          <div className="pdf-summary-card">
            <h4>Fundamental Summary</h4>
            <div className="pdf-summary-gauge">
              <GaugeSvg score={fundScore} size={110} />
            </div>
            <p className="pdf-summary-text">
              {fundPoints.join(' ')}
            </p>
          </div>
          <div className="pdf-summary-card">
            <h4>Technical Summary</h4>
            <div className="pdf-summary-gauge">
              <GaugeSvg score={techScore} size={110} />
            </div>
            <p className="pdf-summary-text">
              {techPoints.join(' ')}
            </p>
          </div>
          <div className="pdf-summary-card">
            <h4>Sentiment Summary</h4>
            <div className="pdf-summary-gauge">
              <GaugeSvg score={sentScore} size={110} />
            </div>
            <p className="pdf-summary-text">
              {sentPoints.join(' ')}
            </p>
          </div>
        </div>

        {/* ── RISK FACTORS ── */}
        <div className="pdf-risk-section">
          <h3>Risk Factors</h3>
          <ul className="pdf-risk-list">
            {riskItems.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>

        {/* ── FOOTER ── */}
        <div className="pdf-footer">
          <span className="pdf-footer-brand">StockInsight</span>
          <span className="pdf-footer-disclaimer">
            This report is for informational purposes only and does not constitute financial advice.
            Past performance is not indicative of future results.
          </span>
          <span>Generated: {today}</span>
        </div>
      </div>
    )
  },
)
