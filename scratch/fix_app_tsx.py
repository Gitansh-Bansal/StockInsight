
import os

file_path = r'c:\Users\gitan\Desktop\DEP\1\StockInsight\frontend\src\App.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find where things started breaking.
# We know the download button part was at around 4300.
# We know technical-snapshot-section is at around 4370 in the broken version.

# Let's search for unique markers.
start_marker = '            ) : ('
end_marker = '          <section' # The technical snapshot section

start_idx = -1
end_idx = -1

for i, line in enumerate(lines):
    if start_marker in line and i > 4000:
        start_idx = i
    if end_marker in line and 'technical-snapshot-section' in lines[i+2] and i > 4000:
        end_idx = i
        break

if start_idx != -1 and end_idx != -1:
    print(f"Found markers at {start_idx} and {end_idx}")
    
    restoration_code = """            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 1v9m0 0L5 7m3 3 3-3M2 12v1.5A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Download PDF Report
              </>
            )}
          </button>
        )}
      </div>
      {pdfDownloadError && (
        <p className="full-report-download-error" role="status">
          {pdfDownloadError}
        </p>
      )}

      <section className="full-report-hero">
        <div className="full-report-hero-left">
          <div className="full-report-title-row">
            <h2>{companyName} ({analysis.ticker})</h2>
            <span className="full-report-exchange-tag">
              {inferExchangeLabel({
                ticker: analysis.ticker,
                symbol: fundamentalData?.symbol,
                exchange: fundamentalData?.exchange,
                fullExchangeName: fundamentalData?.fullExchangeName,
              })}
            </span>
          </div>
          <div className="full-report-price-strip">
            <div className="full-report-price-block">
              <span className="full-report-price">{formatCurrency(latestPrice, displayCurrency)}</span>
              {isFiniteNumber(priceChange) && isFiniteNumber(priceChangePercent) ? (
                <span className={`full-report-price-change ${priceToneClass}`}>
                  {formatSignedNumber(Number(priceChange.toFixed(2)))} {' '}
                  {formatSignedPercent(priceChangePercent)}
                </span>
              ) : (
                <span className="full-report-price-change neutral">Price change unavailable</span>
              )}
            </div>
            <div className="full-report-hero-metric">
              <span>Market Cap</span>
              <strong>{marketCapLabel}</strong>
            </div>
          </div>
        </div>

        <div className="full-report-hero-right">
          <div className="full-report-consensus-box">
            <div>
              <span className="label">Overall Insight Score</span>
              <span className={`full-report-consensus-chip tone-${isFiniteNumber(analysis.overview.overallScore) ? (analysis.overview.overallScore >= 60 ? 'positive' : analysis.overview.overallScore >= 40 ? 'neutral' : 'negative') : 'neutral'}`}>
                {isFiniteNumber(analysis.overview.overallScore) ? (analysis.overview.overallScore >= 60 ? 'BUY' : analysis.overview.overallScore >= 40 ? 'HOLD' : 'SELL') : 'N/A'}
              </span>
            </div>
          </div>
        </div>
      </section>

      <div className="full-report-main-grid">
        <div className="full-report-main-col">
          <article className="full-report-card full-report-executive-card">
            <h3>
              <span className="accent-line" aria-hidden="true" />
              Executive Briefing
            </h3>
            <div className="full-report-executive-content">
              <p>{executiveBriefing}</p>
            </div>
          </article>

          <div className="full-report-mid-grid">
            <article className="full-report-card full-report-revenue-card">
              <h4>Revenue &amp; Profit Trend (USD Bn)</h4>
              <div className="full-report-revenue-bars" aria-hidden="true">
                {revenueRows.map((row, index) => (
                  <div key={`${row.label}-${index}`} className="full-report-revenue-col">
                    <div className="full-report-revenue-tooltip" role="presentation">
                      <p>{row.label}</p>
                      <span>Revenue: {formatCurrency(row.revenueValue, displayCurrency)}</span>
                      <span>Net Profit: {formatCurrency(row.profitValue, displayCurrency)}</span>
                    </div>
                    <div className="full-report-revenue-track">
                      <div className="full-report-revenue-bar-group">
                        <div
                          className="full-report-revenue-bar"
                          style={{ height: `${row.revenueHeight}%` }}
                        />
                        <div
                          className="full-report-profit-bar"
                          style={{ height: `${row.profitHeight}%` }}
                        />
                      </div>
                    </div>
                    <span>{row.label}</span>
                  </div>
                ))}
              </div>
              <div className="full-report-revenue-legend">
                <span>
                  <i className="revenue" aria-hidden="true" />
                  Revenue
                </span>
                <span>
                  <i className="profit" aria-hidden="true" />
                  Net Profit
                </span>
              </div>
            </article>

            <article className="full-report-card full-report-metrics-card">
              <h4>Key Performance Metrics</h4>
              <ul>
                {performanceMetrics.map((metric) => (
                  <li key={metric.label}>
                    <span>{metric.label}</span>
                    <strong className={metric.highlight ? 'is-highlight' : undefined}>
                      {metric.value}
                    </strong>
                  </li>
                ))}
              </ul>
            </article>
          </div>
"""
    # Note: the restoration code above includes the main grid and metrics card too, which might be duplicated if not careful.
    # Looking at the view_file output, lines 4342 onwards in the broken version have the metrics card.
    
    # Wait, let's re-examine the view_file output.
    # 4330:               <div className="full-report-revenue-legend">
    # ...
    # 4342:             <article className="full-report-card full-report-metrics-card">
    
    # So I should only restore up to the start of the metrics card or revenue legend.
    
    # Actually, I'll just replace the whole mess.
    
    new_lines = lines[:start_idx] + [line + '\n' for line in restoration_code.split('\n')] + lines[end_idx:]
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print("File restored successfully.")
else:
    print(f"Could not find markers. start_idx={start_idx}, end_idx={end_idx}")
