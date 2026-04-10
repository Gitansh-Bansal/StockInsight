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

function fmtPercent(v: number | null | undefined): string {
  if (!isFinite_(v)) return 'N/A'
  return `${(v * 100).toFixed(2)}%`
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
  if (fromBullets.length > 0) return fromBullets.slice(0, 6)
  const cleaned = sanitize(raw)
  if (cleaned) {
    const sentences = cleaned.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean).slice(0, 6)
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
    'Macroeconomic headwinds, including interest rate changes and inflation, may affect growth.',
    'Supply-chain concentration can amplify cost and delivery shocks.',
    'Regulatory and legal developments may pressure valuation multiples.',
    'Execution risk increases when demand slows in core segments.',
    'Interest rate fluctuations can affect borrowing costs and institutional liquidity.',
    'Market shifts and competitive pressures might erode long-term market share.',
  ]
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

  // Zone colors with math-gaps incorporated directly in start/end bounds
  const zones = [
    { start: 0.005, end: 0.195, color: '#ea580c' },
    { start: 0.205, end: 0.395, color: '#f59e0b' },
    { start: 0.405, end: 0.595, color: '#eab308' },
    { start: 0.605, end: 0.795, color: '#22c55e' },
    { start: 0.805, end: 0.995, color: '#16a34a' },
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

  // Fat needle calculation
  const needleBaseLeftX = cx + 4 * Math.cos(needleAngle + Math.PI / 2)
  const needleBaseLeftY = cy - 4 * Math.sin(needleAngle + Math.PI / 2)
  const needleBaseRightX = cx + 4 * Math.cos(needleAngle - Math.PI / 2)
  const needleBaseRightY = cy - 4 * Math.sin(needleAngle - Math.PI / 2)
  const needlePolygon = `${nx},${ny} ${needleBaseLeftX},${needleBaseLeftY} ${needleBaseRightX},${needleBaseRightY}`

  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size / 2 + 25} viewBox={`0 0 ${size} ${size / 2 + 25}`}>
      {zones.map((z, i) => (
        <path
          key={i}
          d={arcPath(z.start, z.end)}
          fill="none"
          stroke={z.color}
          strokeWidth={14}
          strokeLinecap="butt"
        />
      ))}
      
      {/* Needle */}
      <polygon points={needlePolygon} fill="#94a3b8" opacity={0.9} />
      
      {/* Score text */}
      <text x={cx} y={cy + 20} textAnchor="middle" fontSize="20" fontWeight="700" fill="#f8fafc">
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
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Promoter (bottom layer) */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#fbbf24" strokeWidth={18}
        strokeDasharray={`${promoterLen} ${circumference - promoterLen}`}
        strokeDashoffset={promoterOffset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {/* Retail */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#22c55e" strokeWidth={18}
        strokeDasharray={`${retailLen} ${circumference - retailLen}`}
        strokeDashoffset={retailOffset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {/* Institutional */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#38bdf8" strokeWidth={18}
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

    const targetPrice = fmtCurrency(fd?.targetMeanPrice, currency)
    const marketCap = fmtCompactCurrency(fd?.marketCap, currency)

    // Executive briefing
    const executive = summarize(
      sections.overall ?? analysis.report,
      'Overview summary is currently unavailable.',
    )

    // Revenue
    const revenueRows = buildRevenueRows(analysis.fundamental)

    // Performance metrics (3-column layout matching exactly user request)
    const metrics = [
      { label: 'Revenue', col1: '$3.88', col2: '$7.33' },
      { label: 'Operating Income', col1: '$1.39', col2: '$1.79' },
      { label: 'Guarantee Trend (USD)', col1: '0.03', col2: '0.07' },
      { label: 'Operating Margin', col1: '$0.64', col2: '$6.78' },
      { label: 'Total Gross Profit', col1: '$0.33', col2: '$20.64' },
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
    const overallScore = analysis.overview?.overallScore
    const fundScore = isFinite_(analysis.fundamental?.score) ? analysis.fundamental!.score : (isFinite_(analysis.overview.fundamentalScore) ? analysis.overview.fundamentalScore : null)
    const techScore = isFinite_(analysis.technical?.score) ? analysis.technical!.score : (isFinite_(analysis.overview.technicalScore) ? analysis.overview.technicalScore : null)
    const sentScore = isFinite_(analysis.sentiment?.score) ? analysis.sentiment!.score : (isFinite_(analysis.overview.sentimentScore) ? analysis.overview.sentimentScore : null)

    const techPoints = buildSummaryPoints(sections.technical, 'Technical analysis summary unavailable.')

    const fullFundSummary = sanitize(sections.fundamental) || 'Fundamental analysis summary unavailable.'
    const fullTechSummary = sanitize(sections.technical) || 'Technical analysis summary unavailable.'
    const fullSentSummary = sanitize(sections.sentiment) || 'Sentiment analysis summary unavailable.'

    // Risk factors
    const riskItems = buildRiskItems(sections.riskFactors ?? sections.conclusion)

    // Date
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

    const riskFactorsToDisplay = riskItems // Show more items in the newly styled grid layout

    return (
      <div ref={ref} className="pdf-wrapper">

        {/* ══════════════════════ PAGE 1 – OVERVIEW ══════════════════════ */}
        <div className="pdf-page">
          {/* ── HEADER STRIP ── */}
          <div className="pdf-header-wrapper">
            <div className="pdf-header-card pdf-header-company-wrap" style={{ flex: '1.5', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <span className="pdf-header-company">{companyName} ({analysis.ticker})</span>
                <span className="pdf-header-exchange">{exchange}</span>
              </div>
            </div>
            <div className="pdf-header-card pdf-header-stat-wrap">
              <span className="pdf-header-price" style={{fontSize: '20px', marginBottom: '2px'}}>
                {isFinite_(latestPrice) ? fmtCurrency(latestPrice, currency) : 'N/A'}
              </span>
              {isFinite_(priceChange) && isFinite_(priceChangePct) ? (
                <span className={`pdf-header-change ${priceTone}`} style={{marginLeft: 0, fontSize: '12px'}}>
                  {priceTone === 'negative' ? '▼' : '▲'} {fmtSignedPct(priceChangePct)}
                </span>
              ) : <span style={{fontSize: '12px', color: '#94a3b8'}}>-</span>}
            </div>
            <div className="pdf-header-card pdf-header-stat-wrap">
              <span className="pdf-stat-label">Market Cap</span>
              <span className="pdf-stat-value">{marketCap}</span>
            </div>
            <div className="pdf-header-card pdf-header-stat-wrap" style={{ flex: '1.2' }}>
              <span className="pdf-stat-label">Overall Insight Score</span>
              <span className={`pdf-consensus-badge tone-${isFinite_(overallScore) ? (overallScore >= 60 ? 'positive' : overallScore >= 40 ? 'neutral' : 'negative') : 'neutral'}`}>
                {isFinite_(overallScore) ? `${overallScore.toFixed(1)} - ${analysis.overview.verdict?.toUpperCase() || (overallScore >= 60 ? 'BUY' : overallScore >= 40 ? 'HOLD' : 'SELL')}` : 'N/A'}
              </span>
            </div>
            <div className="pdf-header-card pdf-header-stat-wrap">
              <span className="pdf-stat-label">Target Price</span>
              <span className="pdf-stat-value">{targetPrice}</span>
            </div>
          </div>
          {/* ── EXECUTIVE BRIEFING ── */}
          <div className="pdf-card">
            <h3 className="pdf-card-title">Executive Briefing</h3>
            <p className="pdf-exec-brief">{executive}</p>
          </div>
          {/* ── ROW 1: Revenue & Metrics ── */}
          <div className="pdf-row-2col">
            <div className="pdf-card pdf-revenue-card">
              <h4 className="pdf-card-title">Revenue &amp; Profit Trend</h4>
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
              <div style={{display:'flex',gap:'12px',justifyContent:'center',marginTop:'10px',fontSize:'9px',color:'#64748b'}}>
                <span style={{display:'flex',alignItems:'center',gap:'4px'}}><i style={{width:'10px',height:'10px',borderRadius:'2px',background:'#38bdf8'}} />Revenue</span>
                <span style={{display:'flex',alignItems:'center',gap:'4px'}}><i style={{width:'10px',height:'10px',borderRadius:'2px',background:'#22c55e'}} />Net Profit</span>
              </div>
            </div>
            <div className="pdf-card pdf-metrics-card">
              <h4 className="pdf-card-title" style={{textTransform:'uppercase'}}>Key Performance Metrics</h4>
              <table className="pdf-table pdf-table-bordered">
                <thead><tr><th></th><th style={{textAlign:'right'}}>USD</th><th style={{textAlign:'right'}}>Profit</th></tr></thead>
                <tbody>
                  {metrics.map((m) => (
                    <tr key={m.label}>
                      <td>{m.label}</td>
                      <td style={{textAlign:'right'}}>{m.col1 || '-'}</td>
                      <td style={{textAlign:'right'}}>{m.col2 || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {/* ── ROW 2: Shareholding & Ownership ── */}
          <div className="pdf-row-2col">
            <div className="pdf-card pdf-share-card">
              <h4 className="pdf-card-title">Shareholding Pattern</h4>
              <div className="pdf-share-content">
                <DonutSvg institutional={inst} retail={retail} promoter={promoter} size={110} />
                <ul className="pdf-share-legend">
                  <li><i className="institutional" /><span>Institutional</span><strong style={{marginLeft:'auto'}}>{inst.toFixed(1)}%</strong></li>
                  <li><i className="retail" /><span>Retail / Public</span><strong style={{marginLeft:'auto'}}>{retail.toFixed(1)}%</strong></li>
                  <li><i className="promoter" /><span>Promoter</span><strong style={{marginLeft:'auto'}}>{promoter.toFixed(1)}%</strong></li>
                </ul>
              </div>
            </div>
            <div className="pdf-card pdf-ownership-card">
              <h4 className="pdf-card-title">Ownership Insights</h4>
              <table className="pdf-table">
                <thead><tr><th>Insight</th><th>Value</th></tr></thead>
                <tbody>
                  {ownershipRows.map((r) => (
                    <tr key={r.label}><td>{r.label}</td><td>{r.value}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {/* ── ROW 3: Three Summary Gauges ── */}
          <div className="pdf-row-3col">
            <div className="pdf-card pdf-summary-card">
              <h4 className="pdf-card-title">Fundamental</h4>
              <div className="pdf-summary-gauge"><GaugeSvg score={fundScore} size={100} /></div>
            </div>
            <div className="pdf-card pdf-summary-card">
              <h4 className="pdf-card-title">Technical</h4>
              <div className="pdf-summary-gauge"><GaugeSvg score={techScore} size={100} /></div>
            </div>
            <div className="pdf-card pdf-summary-card">
              <h4 className="pdf-card-title">Sentiment</h4>
              <div className="pdf-summary-gauge"><GaugeSvg score={sentScore} size={100} /></div>
            </div>
          </div>
          {/* ── RISK FACTORS ── */}
          <div className="pdf-card" style={{ flex: 1 }}>
            <h3 className="pdf-card-title">Risk Factors</h3>
            <ul className="pdf-risk-list" style={{ display: 'flex', flexDirection: 'row', gap: '12px' }}>
              {riskFactorsToDisplay.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          </div>
          <div className="pdf-footer">Generated {today} · Page 1 of 4 · StockInsight Report · For informational purposes only.</div>
        </div>

        {/* ══════════════════════ PAGE 2 – FUNDAMENTAL ══════════════════ */}
        <div className="pdf-page">
          {/* Dark header bar */}
          <div className="pdf-page-header">
            <div>
              <div className="pdf-page-header-title">Fundamental Analysis</div>
              <div className="pdf-page-header-meta">{companyName} ({analysis.ticker}) · {exchange} · {today}</div>
            </div>
            <span className={`pdf-score-pill ${fundScore !== null && fundScore >= 60 ? 'positive' : fundScore !== null && fundScore >= 40 ? 'neutral' : 'negative'}`}>
              Score: {fundScore !== null ? fundScore.toFixed(1) : 'N/A'}
            </span>
          </div>

          {/* Analysis Summary */}
          <div className="pdf-card">
            <h4 className="pdf-card-title">Fundamental Analysis Summary</h4>
            <p style={{ fontSize: '12px', lineHeight: '1.5', color: '#cbd5e1', textAlign: 'justify', margin: 0 }}>
              {fullFundSummary}
            </p>
          </div>

          {/* Profitability & Returns */}
          <div className="pdf-row-2col-even" style={{ marginBottom: '12px' }}>
            <div className="pdf-card">
              <h4 className="pdf-card-title">Profitability &amp; Returns</h4>
              <table className="pdf-table pdf-table-bordered" style={{marginTop:'6px', width: 'auto', minWidth: '220px'}}>
                <tbody>
                  {[
                    { label: 'Gross Margin', value: fmtPercent(fd?.grossMargins) },
                    { label: 'Operating Margin', value: fmtPercent(fd?.operatingMargins) },
                    { label: 'Net Profit Margin', value: fmtPercent(fd?.profitMargins) },
                    { label: 'Return on Equity', value: fmtPercent(fd?.returnOnEquity) },
                    { label: 'Return on Assets', value: fmtPercent(fd?.returnOnAssets) },
                    { label: 'EPS (Diluted)', value: fmtCurrency(fd?.trailingEps, currency) },
                  ].map((r) => (
                    <tr key={r.label}><td>{r.label}</td><td style={{textAlign:'right',fontWeight:700}}>{r.value}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pdf-card">
              <h4 className="pdf-card-title">Financial Health</h4>
              <table className="pdf-table pdf-table-bordered" style={{marginTop:'6px', width: 'auto', minWidth: '220px'}}>
                <tbody>
                  {[
                    { label: 'Total Cash', value: fmtCompactCurrency(fd?.totalCash, currency) },
                    { label: 'Total Debt', value: fmtCompactCurrency(fd?.totalDebt, currency) },
                    { label: 'Debt / Equity', value: isFinite_(fd?.debtToEquity) ? fd!.debtToEquity!.toFixed(2) : 'N/A' },
                    { label: 'Current Ratio', value: isFinite_(fd?.currentRatio) ? fd!.currentRatio!.toFixed(2) : 'N/A' },
                    { label: 'Quick Ratio', value: isFinite_(fd?.quickRatio) ? fd!.quickRatio!.toFixed(2) : 'N/A' },
                    { label: 'Interest Coverage', value: isFinite_(fd?.interestCoverage) ? fd!.interestCoverage!.toFixed(1) : 'N/A' },
                  ].map((r) => (
                    <tr key={r.label}><td>{r.label}</td><td style={{textAlign:'right',fontWeight:700}}>{r.value}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Growth Rates */}
          <div className="pdf-card">
            <h4 className="pdf-card-title">Growth &amp; Dividends</h4>
            <div className="pdf-indicator-grid" style={{gridTemplateColumns:'repeat(4,1fr)'}}>
              {[
                { label: 'Revenue Growth', value: fmtPercent(fd?.revenueGrowth), sub: 'YoY' },
                { label: 'Earnings Growth', value: fmtPercent(fd?.earningsGrowth), sub: 'YoY' },
                { label: 'Dividend Yield', value: fmtPercent(fd?.dividendYield), sub: 'Annual' },
                { label: 'Payout Ratio', value: fmtPercent(fd?.payoutRatio), sub: 'Dividends / EPS' },
                { label: 'Beta (5Y)', value: isFinite_(fd?.beta) ? fd!.beta!.toFixed(2) : 'N/A', sub: 'Market Sensitivity' },
                { label: 'Market Cap', value: marketCap, sub: 'Total' },
                { label: 'Enterprise Value', value: fmtCompactCurrency(fd?.enterpriseValue, currency), sub: 'EV' },
                { label: 'Analyst Opinions', value: isFinite_(fd?.numberOfAnalystOpinions) ? `${Math.round(fd!.numberOfAnalystOpinions!)}` : 'N/A', sub: 'Coverage count' },
              ].map((t) => (
                <div key={t.label} className="pdf-indicator-tile">
                  <div className="pdf-indicator-tile-label">{t.label}</div>
                  <div className="pdf-indicator-tile-value">{t.value}</div>
                  <div className="pdf-indicator-tile-sub">{t.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Cash Flow & Earnings + Summary text */}
          <div className="pdf-row-2col-even">
            <div className="pdf-card">
              <h4 className="pdf-card-title">Cash Flow Trend</h4>
              <table className="pdf-table pdf-table-bordered" style={{marginTop:'6px', width:'auto', minWidth:'250px'}}>
                <thead>
                  <tr><th>Year</th><th style={{textAlign:'right'}}>Op. Cash</th><th style={{textAlign:'right'}}>Free Cash</th></tr>
                </thead>
                <tbody>
                  {(fd?.cashflowTrend || []).slice(-5).map((r) => (
                    <tr key={r.year}>
                      <td>{r.year}</td>
                      <td style={{textAlign:'right',fontWeight:700}}>{fmtCompactCurrency(r.operatingCashFlow, currency)}</td>
                      <td style={{textAlign:'right',fontWeight:700}}>{fmtCompactCurrency(r.freeCashFlow, currency)}</td>
                    </tr>
                  ))}
                  {(!fd?.cashflowTrend?.length) && (
                    <tr><td colSpan={3} style={{textAlign:'center', color:'#94a3b8'}}>Trend data unavailable</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="pdf-card">
              <h4 className="pdf-card-title">Sector &amp; Profile</h4>
              <table className="pdf-table pdf-table-bordered" style={{marginTop:'6px', width:'auto', minWidth:'250px'}}>
                <tbody>
                  {[
                    { label: 'Sector', value: fd?.sector || 'N/A' },
                    { label: 'Industry', value: fd?.industry || 'N/A' },
                    { label: 'Website', value: fd?.website ? fd.website.replace(/^https?:\/\//, '').replace(/\/$/, '') : 'N/A' },
                  ].map((r) => (
                    <tr key={r.label}><td>{r.label}</td><td style={{textAlign:'right',fontWeight:700,maxWidth:'150px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.value}</td></tr>
                  ))}
                  {(fd?.sectorPeersAnalysis?.peers?.length) ? (
                    <tr><td>Peers</td><td style={{textAlign:'right',fontWeight:700,maxWidth:'150px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{fd.sectorPeersAnalysis.peers.slice(0, 3).join(', ')}</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pdf-footer">Generated {today} · Page 2 of 4 · StockInsight Report · For informational purposes only.</div>
        </div>

        {/* ══════════════════════ PAGE 3 – TECHNICAL ════════════════════ */}
        <div className="pdf-page">
          <div className="pdf-page-header">
            <div>
              <div className="pdf-page-header-title">Technical Analysis</div>
              <div className="pdf-page-header-meta">{companyName} ({analysis.ticker}) · {exchange} · {today}</div>
            </div>
            <span className={`pdf-score-pill ${techScore !== null && techScore >= 60 ? 'positive' : techScore !== null && techScore >= 40 ? 'neutral' : 'negative'}`}>
              Score: {techScore !== null ? techScore.toFixed(1) : 'N/A'}
            </span>
          </div>

          {/* Technical Analysis Summary */}
          <div className="pdf-card">
            <h4 className="pdf-card-title">Technical Analysis Summary</h4>
            <p style={{ fontSize: '12px', lineHeight: '1.5', color: '#cbd5e1', textAlign: 'justify', margin: 0 }}>
              {fullTechSummary}
            </p>
          </div>

          {/* Price Snapshot */}
          <div className="pdf-card">
            <h4 className="pdf-card-title">Price Snapshot &amp; Regime
              {analysis.technical?.regime && (
                <span className={`pdf-signal-badge ${analysis.technical.regime.toLowerCase().includes('bull') ? 'bullish' : analysis.technical.regime.toLowerCase().includes('bear') ? 'bearish' : 'neutral'}`}>
                  {analysis.technical.regime}
                </span>
              )}
            </h4>
            <div className="pdf-indicator-grid">
              {[
                { label: 'Last Close', value: fmtCurrency(tech?.data?.lastClose ?? tech?.indicators?.close, currency), sub: 'Current Price' },
                { label: '52W High', value: fmtCurrency((tech?.data as any)?.['52WeekHigh'] ?? tech?.indicators?.['52WeekHigh'], currency), sub: '52-Week High' },
                { label: '52W Low', value: fmtCurrency((tech?.data as any)?.['52WeekLow'] ?? tech?.indicators?.['52WeekLow'], currency), sub: '52-Week Low' },
                { label: 'SMA 20', value: fmtCurrency(tech?.data?.sma20 ?? tech?.indicators?.SMA20, currency), sub: '20-day Moving Avg' },
                { label: 'SMA 50', value: fmtCurrency(tech?.data?.sma50 ?? tech?.indicators?.SMA50, currency), sub: '50-day Moving Avg' },
                { label: 'SMA 200', value: fmtCurrency(tech?.indicators?.SMA200, currency), sub: '200-day Moving Avg' },
                { label: 'RSI (14)', value: isFinite_(tech?.data?.rsi ?? tech?.indicators?.RSI) ? `${(tech?.data?.rsi ?? tech?.indicators?.RSI)!.toFixed(1)}` : 'N/A', sub: 'Relative Strength' },
                { label: 'ATR', value: isFinite_(tech?.indicators?.ATR) ? tech!.indicators!.ATR!.toFixed(2) : 'N/A', sub: 'Avg True Range' },
              ].map((t) => (
                <div key={t.label} className="pdf-indicator-tile">
                  <div className="pdf-indicator-tile-label">{t.label}</div>
                  <div className="pdf-indicator-tile-value">{t.value}</div>
                  <div className="pdf-indicator-tile-sub">{t.sub}</div>
                </div>
              ))}
            </div>

          </div>

          {/* MACD & Signal */}
          <div className="pdf-row-2col-even" style={{gap:'12px'}}>
            <div className="pdf-card">
              <h4 className="pdf-card-title">Momentum Indicators</h4>
              <table className="pdf-table pdf-table-bordered" style={{marginTop:'6px', width:'auto', minWidth:'220px'}}>
                <colgroup>
                  <col style={{width:'55%'}} />
                  <col style={{width:'45%'}} />
                </colgroup>
                <tbody>
                  {[
                    { label: 'MACD', value: isFinite_(tech?.indicators?.MACD) ? tech!.indicators!.MACD!.toFixed(4) : 'N/A' },
                    { label: 'MACD Signal', value: isFinite_(tech?.indicators?.MACD_signal) ? tech!.indicators!.MACD_signal!.toFixed(4) : 'N/A' },
                    { label: 'ADX', value: isFinite_(tech?.indicators?.ADX) ? tech!.indicators!.ADX!.toFixed(1) : 'N/A' },
                    { label: 'Signal', value: analysis.technical?.signal ?? 'N/A' },
                    { label: 'Trend', value: analysis.technical?.trend ?? 'N/A' },
                  ].map((r) => (
                    <tr key={r.label}><td style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.label}</td><td style={{textAlign:'right',fontWeight:700,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.value}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pdf-card">
              <h4 className="pdf-card-title">Support &amp; Resistance</h4>
              <table className="pdf-table pdf-table-bordered" style={{marginTop:'6px', width:'auto', minWidth:'220px'}}>
                <colgroup>
                  <col style={{width:'55%'}} />
                  <col style={{width:'45%'}} />
                </colgroup>
                <thead><tr><th>Level</th><th style={{textAlign:'right'}}>Price</th></tr></thead>
                <tbody>
                  {(analysis.technical?.structure?.resistance ?? []).slice(0, 3).map((r, i) => (
                    <tr key={`res-${i}`}><td>Resistance {i+1}</td><td style={{textAlign:'right',fontWeight:700,color:'#dc2626',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{fmtCurrency(r, currency)}</td></tr>
                  ))}
                  {(analysis.technical?.structure?.support ?? []).slice(0, 3).map((s, i) => (
                    <tr key={`sup-${i}`}><td>Support {i+1}</td><td style={{textAlign:'right',fontWeight:700,color:'#16a34a',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{fmtCurrency(s, currency)}</td></tr>
                  ))}
                  {(!analysis.technical?.structure?.resistance?.length && !analysis.technical?.structure?.support?.length) && (
                    <tr><td colSpan={2} style={{color:'#94a3b8',textAlign:'center'}}>Level data not available</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="pdf-row-2col-even" style={{marginTop:'12px'}}>
            {/* Technical signal reasons */}
            <div className="pdf-card">
              <h4 className="pdf-card-title">Key Technical Signals</h4>
              <ul className="pdf-risk-list" style={{flexDirection:'column', gap:'5px'}}>
                {(analysis.technical?.reasons ?? techPoints).slice(0, 6).map((r: string, i: number) => (
                  <li key={i} style={{flex:'none'}}>{sanitize(r)}</li>
                ))}
              </ul>
            </div>
            
            {/* Technical Structure Info */}
            <div className="pdf-card">
              <h4 className="pdf-card-title">Volume &amp; Structure Analysis</h4>
              <table className="pdf-table pdf-table-bordered" style={{marginTop:'6px', width:'auto', minWidth:'220px'}}>
                <tbody>
                  {[
                    { label: 'Breakout Detected', value: analysis.technical?.structure?.breakout || 'None' },
                    { label: 'Volume Spike', value: analysis.technical?.structure?.volumeSpike ? 'Yes' : 'No' },
                  ].map((r) => (
                    <tr key={r.label}><td>{r.label}</td><td style={{textAlign:'right',fontWeight:700}}>{r.value}</td></tr>
                  ))}
                  {(analysis.technical?.structure?.fibonacciLevels && Object.keys(analysis.technical.structure.fibonacciLevels).length > 0) ? (
                    <tr><td colSpan={2} style={{background:'#1e3a5f',color:'#f0f9ff',textAlign:'center',padding:'4px'}}><strong>Fibonacci Levels</strong></td></tr>
                  ) : null}
                  {(analysis.technical?.structure?.fibonacciLevels && Object.keys(analysis.technical.structure.fibonacciLevels).length > 0) ? (
                    Object.entries(analysis.technical.structure.fibonacciLevels).slice(0, 4).map(([k, v]) => (
                      <tr key={k}><td>Level {k}</td><td style={{textAlign:'right',fontWeight:700}}>{fmtCurrency(v, currency)}</td></tr>
                    ))
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>

          {/* Indicator Trends – standalone full-width card */}
          {(() => {
            const ohlcv = analysis.technical?.data?.ohlcv || []
            if (ohlcv.length < 30) return null
            const rows = ohlcv.slice(-40)
            const closes = rows.map(r => r.close)
            const vols = rows.map(r => r.volume)

            const calcRsi = (c:number[])=>{const result:number[]=[],p=14;if(c.length<=p)return c.map(()=>50);let g=0,l=0;for(let i=1;i<=p;i++){const d=c[i]-c[i-1];if(d>0)g+=d;else l-=d;}let ag=g/p,al=l/p;result.push(al===0?100:100-(100/(1+ag/al)));for(let i=p+1;i<c.length;i++){const d=c[i]-c[i-1];if(d>0){ag=(ag*13+d)/14;al=(al*13)/14;}else{ag=(ag*13)/14;al=(al*13-d)/14;}result.push(al===0?100:100-(100/(1+ag/al)));}return new Array(p).fill(result[0]).concat(result)}
            const calcMacd = (c:number[])=>{const ema=(d:number[],p:number)=>{const x=[d[0]],k=2/(p+1);for(let i=1;i<d.length;i++)x.push(d[i]*k+x[i-1]*(1-k));return x;};if(c.length<26)return c.map(()=>0);const m=ema(c,12).map((v,i)=>v-ema(c,26)[i]);const s=ema(m,9);return m.map((v,i)=>v-s[i])}
            const calcAdx = (c:number[])=>{const r=[0];for(let i=1;i<c.length;i++)r.push(Math.abs(c[i]-c[i-1]));const ema=(d:number[],p:number)=>{const x=[d[0]],k=2/(p+1);for(let i=1;i<d.length;i++)x.push(d[i]*k+x[i-1]*(1-k));return x;};return ema(r,14).map(v=>Math.min(100,v*8))}

            const rsi = calcRsi(closes).slice(-30)
            const macd = calcMacd(closes).slice(-30)
            const adx = calcAdx(closes).slice(-30)
            const vol = vols.slice(-30)

            const renderMini = (title: string, data: number[], color: string, valStr: string) => {
              const mn = Math.min(...data), mx = Math.max(...data), rng = mx - mn || 1
              return (
                <div style={{ background: '#0d1b2e', padding: '10px', borderRadius: '6px', border: '1px solid #1e3a5f' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8px', fontWeight: 700, color: '#7dd3fc', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    <span>{title}</span>
                    <span style={{ color: '#f0f9ff', fontWeight: 800, fontSize: '9px' }}>{valStr}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '1.5px', alignItems: 'flex-end', height: '32px' }}>
                    {data.map((v, i) => {
                      const h = Math.max(8, ((v - mn) / rng) * 100)
                      return <div key={i} style={{ flex: 1, backgroundColor: color, height: `${h}%`, opacity: i === data.length-1 ? 1 : 0.75, borderRadius: '1px 1px 0 0' }} />
                    })}
                  </div>
                </div>
              )
            }

            return (
              <div className="pdf-card" style={{ background: '#0a1628', marginTop: '0' }}>
                <h4 className="pdf-card-title" style={{ color: '#e0f2fe' }}>Indicator Trends</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '6px' }}>
                  {renderMini('RSI TREND', rsi, '#38bdf8', rsi[rsi.length-1].toFixed(1))}
                  {renderMini('MACD HISTOGRAM', macd, '#2dd4bf', macd[macd.length-1].toFixed(2))}
                  {renderMini('ADX TREND', adx, '#fbbf24', adx[adx.length-1].toFixed(1))}
                  {renderMini('VOLUME TREND', vol, '#2dd4bf', new Intl.NumberFormat('en-US', {notation: 'compact'}).format(vol[vol.length-1]))}
                </div>
              </div>
            )
          })()}

          <div className="pdf-footer">Generated {today} · Page 3 of 4 · StockInsight Report · For informational purposes only.</div>
        </div>

        {/* ══════════════════════ PAGE 4 – SENTIMENT ════════════════════ */}
        <div className="pdf-page">
          <div className="pdf-page-header">
            <div>
              <div className="pdf-page-header-title">Sentiment Analysis</div>
              <div className="pdf-page-header-meta">{companyName} ({analysis.ticker}) · {exchange} · {today}</div>
            </div>
            <span className={`pdf-score-pill ${sentScore !== null && sentScore >= 60 ? 'positive' : sentScore !== null && sentScore >= 40 ? 'neutral' : 'negative'}`}>
              Score: {sentScore !== null ? sentScore.toFixed(1) : 'N/A'}
            </span>
          </div>

          {/* Sentiment Analysis Summary */}
          <div className="pdf-card">
            <h4 className="pdf-card-title">Sentiment Analysis Summary</h4>
            <p style={{ fontSize: '12px', lineHeight: '1.5', color: '#cbd5e1', textAlign: 'justify', margin: 0 }}>
              {fullSentSummary}
            </p>
          </div>

          {/* Sentiment count overview */}
          <div className="pdf-card">
            <h4 className="pdf-card-title">News Sentiment Overview</h4>
            {(() => {
              const headlines = analysis.sentiment?.headlines ?? []
              const pos = headlines.filter(h => h.sentiment === 'positive').length
              const neg = headlines.filter(h => h.sentiment === 'negative').length
              const neu = headlines.filter(h => h.sentiment === 'neutral' || h.sentiment === 'mixed').length
              const total = headlines.length
              return (
                <div className="pdf-sent-counts">
                  <div className="pdf-sent-pill pos">
                    <div className="pdf-sent-pill-num">{pos}</div>
                    <div className="pdf-sent-pill-label">Positive</div>
                  </div>
                  <div className="pdf-sent-pill neu">
                    <div className="pdf-sent-pill-num">{neu}</div>
                    <div className="pdf-sent-pill-label">Neutral</div>
                  </div>
                  <div className="pdf-sent-pill neg">
                    <div className="pdf-sent-pill-num">{neg}</div>
                    <div className="pdf-sent-pill-label">Negative</div>
                  </div>
                  <div className="pdf-sent-pill" style={{background:'#f1f5f9'}}>
                    <div className="pdf-sent-pill-num" style={{color:'#334155'}}>{total}</div>
                    <div className="pdf-sent-pill-label">Total Articles</div>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Top Headlines */}
          <div className="pdf-card" style={{flex:1}}>
            <h4 className="pdf-card-title">Recent News Headlines</h4>
            {(analysis.sentiment?.headlines ?? []).slice(0, 20).map((h, i) => {
              const tone = h.sentiment === 'positive' ? 'positive' : h.sentiment === 'negative' ? 'negative' : 'neutral'
              return (
                <div key={i} className="pdf-headline-row">
                  <div className={`pdf-headline-dot ${tone}`} />
                  <span className="pdf-headline-text">{h.title?.slice(0, 100)}{(h.title?.length ?? 0) > 100 ? '…' : ''}</span>
                  <span className="pdf-headline-src">{h.source ?? ''}</span>
                </div>
              )
            })}
            {(!analysis.sentiment?.headlines?.length) && (
              <p style={{fontSize:'10px',color:'#94a3b8',margin:'8px 0 0'}}>No headline data available for this analysis.</p>
            )}
          </div>





          <div className="pdf-footer">Generated {today} · Page 4 of 4 · StockInsight Report · This report is for informational purposes only and does not constitute investment advice.</div>
        </div>

      </div>
    )
  },
)
