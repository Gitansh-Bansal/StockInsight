import type { AnalysisResponse, OhlcvPoint } from './types'

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
  /\/$/,
  '',
)

const inFlightAnalysisRequests = new Map<string, Promise<AnalysisResponse>>()

function apiUrl(path: string): string {
  if (apiBaseUrl) {
    return `${apiBaseUrl}${path}`
  }
  return path
}

export async function fetchAnalysis(
  ticker: string,
): Promise<AnalysisResponse> {
  const cleanTicker = ticker.trim().toUpperCase()
  const requestKey = cleanTicker
  const existingRequest = inFlightAnalysisRequests.get(requestKey)
  if (existingRequest) {
    return existingRequest
  }

  const requestPromise = (async () => {
    const url = apiUrl(
      `/api/analysis/${encodeURIComponent(cleanTicker)}?include_report=true`,
    )

    const response = await fetch(url)
    const payload = (await response.json()) as AnalysisResponse

    if (!response.ok) {
      throw new Error(payload.error ?? 'Failed to load analysis.')
    }
    return payload
  })()

  inFlightAnalysisRequests.set(requestKey, requestPromise)
  try {
    return await requestPromise
  } finally {
    inFlightAnalysisRequests.delete(requestKey)
  }
}

export async function fetchChartData(
  ticker: string,
  duration: string,
): Promise<{ ohlcv: OhlcvPoint[]; currency?: string }> {
  const url = apiUrl(
    `/api/analysis/chart/${encodeURIComponent(ticker.trim().toUpperCase())}?duration=${encodeURIComponent(duration)}`,
  )
  const response = await fetch(url)
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload.error ?? 'Failed to load chart data.')
  }
  return payload
}
