import type { AnalysisResponse } from './types'

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
  /\/$/,
  '',
)

function apiUrl(path: string): string {
  if (apiBaseUrl) {
    return `${apiBaseUrl}${path}`
  }
  return path
}

export async function fetchAnalysis(
  ticker: string,
  period: string,
): Promise<AnalysisResponse> {
  const cleanTicker = ticker.trim().toUpperCase()
  const url = apiUrl(
    `/api/analysis/${encodeURIComponent(cleanTicker)}?period=${encodeURIComponent(period)}&include_report=true`,
  )

  const response = await fetch(url)
  const payload = (await response.json()) as AnalysisResponse

  if (!response.ok) {
    throw new Error(payload.error ?? 'Failed to load analysis.')
  }
  return payload
}
