import type {
  AnalysisResponse,
  AuthUser,
  OhlcvPoint,
  SearchSuggestion,
  UsdFxRatesResponse,
} from './types'

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(
  /\/$/,
  '',
)

const inFlightAnalysisRequests = new Map<string, Promise<AnalysisResponse>>()
const analysisResponseCache = new Map<string, AnalysisResponse>()
const usdFxRateCache = new Map<string, number>()
const inFlightSearchRequests = new Map<string, Promise<SearchSuggestion[]>>()
const searchSuggestionCache = new Map<string, SearchSuggestion[]>()
let csrfTokenCache = ''

function apiUrl(path: string): string {
  if (apiBaseUrl) {
    return `${apiBaseUrl}${path}`
  }
  return path
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    return {}
  }

  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

async function ensureCsrfToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && csrfTokenCache) {
    return csrfTokenCache
  }

  const response = await fetch(apiUrl('/api/auth/csrf'), {
    credentials: 'include',
  })
  const payload = await readJson(response)
  const token = typeof payload.csrfToken === 'string' ? payload.csrfToken : ''

  if (!response.ok || !token) {
    throw new Error('Unable to initialize secure session.')
  }

  csrfTokenCache = token
  return token
}

async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = new Headers(init.headers)

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    headers.set('X-CSRFToken', await ensureCsrfToken())
  }

  const response = await fetch(apiUrl(path), {
    ...init,
    credentials: 'include',
    headers,
  })

  const payload = await readJson(response)
  if (!response.ok) {
    throw new Error(
      typeof payload.error === 'string' ? payload.error : 'Request failed.',
    )
  }

  return payload as T
}

type AuthEnvelope = {
  user: AuthUser
}

type CurrentUserEnvelope = {
  authenticated: boolean
  user: AuthUser | null
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const payload = await apiRequest<CurrentUserEnvelope>('/api/auth/me')
  return payload.authenticated ? payload.user : null
}

export async function loginUser(
  identifier: string,
  password: string,
): Promise<AuthUser> {
  const payload = await apiRequest<AuthEnvelope>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  })
  return payload.user
}

export async function registerUser(input: {
  username: string
  email: string
  password: string
  confirmPassword: string
}): Promise<AuthUser> {
  const payload = await apiRequest<AuthEnvelope>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return payload.user
}

export async function logoutUser(): Promise<void> {
  await apiRequest('/api/auth/logout', {
    method: 'POST',
  })
  csrfTokenCache = ''
}

export async function fetchAnalysis(
  ticker: string,
): Promise<AnalysisResponse> {
  const cleanTicker = ticker.trim().toUpperCase()
  const requestKey = cleanTicker
  const cachedResponse = analysisResponseCache.get(requestKey)
  if (cachedResponse) {
    return cachedResponse
  }

  const existingRequest = inFlightAnalysisRequests.get(requestKey)
  if (existingRequest) {
    return existingRequest
  }

  const requestPromise = (async () => {
    return apiRequest<AnalysisResponse>(
      `/api/analysis/${encodeURIComponent(cleanTicker)}?include_report=true`,
    )
  })()

  inFlightAnalysisRequests.set(requestKey, requestPromise)
  try {
    const response = await requestPromise
    analysisResponseCache.set(requestKey, response)
    return response
  } finally {
    inFlightAnalysisRequests.delete(requestKey)
  }
}

export async function fetchMultipleAnalyses(
  tickers: string[],
): Promise<AnalysisResponse[]> {
  const cleanTickers = tickers
    .map((ticker) => ticker.trim().toUpperCase())
    .filter(Boolean)

  return Promise.all(cleanTickers.map((ticker) => fetchAnalysis(ticker)))
}

export async function fetchUsdFxRates(
  currencies: string[],
): Promise<Record<string, number>> {
  const normalizedCurrencies = Array.from(
    new Set(
      currencies
        .map((currency) => currency.trim().toUpperCase())
        .filter(Boolean),
    ),
  )

  const missingCurrencies = normalizedCurrencies.filter(
    (currency) => !usdFxRateCache.has(currency),
  )

  if (missingCurrencies.length > 0) {
    const payload = await apiRequest<UsdFxRatesResponse>(
      `/api/fx/usd?currencies=${encodeURIComponent(missingCurrencies.join(','))}`,
    )

    Object.entries(payload.rates ?? {}).forEach(([currency, rate]) => {
      if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
        usdFxRateCache.set(currency.trim().toUpperCase(), rate)
      }
    })
  }

  const rates: Record<string, number> = {}
  normalizedCurrencies.forEach((currency) => {
    const cachedRate = usdFxRateCache.get(currency)
    if (cachedRate) {
      rates[currency] = cachedRate
    }
  })
  return rates
}

export async function fetchChartData(
  ticker: string,
  duration: string,
): Promise<{ ohlcv: OhlcvPoint[]; currency?: string }> {
  return apiRequest<{ ohlcv: OhlcvPoint[]; currency?: string }>(
    `/api/analysis/chart/${encodeURIComponent(ticker.trim().toUpperCase())}?duration=${encodeURIComponent(duration)}`,
  )
}

export async function fetchSearchSuggestions(
  query: string,
  limit = 8,
  signal?: AbortSignal,
): Promise<SearchSuggestion[]> {
  const cleanQuery = query.trim()
  if (!cleanQuery) {
    return []
  }

  const requestKey = `${cleanQuery.toLowerCase()}::${limit}`
  if (!signal) {
    const cached = searchSuggestionCache.get(requestKey)
    if (cached) {
      return cached
    }

    const existingRequest = inFlightSearchRequests.get(requestKey)
    if (existingRequest) {
      return existingRequest
    }
  }

  const requestPromise = (async () => {
    const payload = await apiRequest<{
      suggestions?: SearchSuggestion[]
    }>(
      `/api/search?q=${encodeURIComponent(cleanQuery)}&limit=${encodeURIComponent(String(limit))}`,
      { signal },
    )

    return Array.isArray(payload.suggestions) ? payload.suggestions : []
  })()

  if (!signal) {
    inFlightSearchRequests.set(requestKey, requestPromise)
  }

  try {
    const suggestions = await requestPromise
    if (!signal) {
      searchSuggestionCache.set(requestKey, suggestions)
    }
    return suggestions
  } finally {
    if (!signal) {
      inFlightSearchRequests.delete(requestKey)
    }
  }
}
