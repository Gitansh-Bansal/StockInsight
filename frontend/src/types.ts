export type NullableScore = number | null

export interface OverviewData {
  fundamentalScore: NullableScore
  technicalScore: NullableScore
  sentimentScore: NullableScore
  overallScore: number
  verdict: string
}

export interface FundamentalData {
  symbol?: string
  shortName?: string
  longName?: string
  sector?: string
  industry?: string
  website?: string
  description?: string
  currentPrice?: number
  currency?: string
  marketCap?: number
  enterpriseValue?: number
  beta?: number
  trailingPE?: number
  forwardPE?: number
  pegRatio?: number
  priceToBook?: number
  trailingEps?: number
  returnOnEquity?: number
  returnOnAssets?: number
  operatingMargins?: number
  profitMargins?: number
  debtToEquity?: number
  currentRatio?: number
  revenueGrowth?: number
  earningsGrowth?: number
  dividendYield?: number
  ['52WeekHigh']?: number
  ['52WeekLow']?: number
  enterpriseToEbitda?: number
  returnOnCapitalEmployed?: number
  interestCoverage?: number
  priceToSalesTrailing12Months?: number
  quickRatio?: number
  grossMargins?: number
  totalCash?: number
  totalDebt?: number
  payoutRatio?: number
  targetMeanPrice?: number
  recommendationKey?: string
  numberOfAnalystOpinions?: number
  revenueTrend?: Array<{ year: number; revenue: number | null; netProfit: number | null }>
  marginsTrend?: Array<{ year: number; operatingMargin: number | null; netMargin: number | null }>
  cashflowTrend?: Array<{ year: number; operatingCashFlow: number | null; freeCashFlow: number | null }>
  shareholdingPattern?: {
    promoters: number
    institutions: number
    public: number
  }
}

export interface FundamentalResult {
  data: FundamentalData
  score: number
}

export interface OhlcvPoint {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface TechnicalData {
  symbol: string
  currency?: string
  ohlcv: OhlcvPoint[]
  lastClose: number | null
  sma20: number | null
  sma50: number | null
  rsi: number | null
  ['52WeekLow']: number | null
  ['52WeekHigh']: number | null
}

export interface TechnicalIndicators {
  close?: number
  RSI?: number
  MACD?: number
  MACD_signal?: number
  ADX?: number
  ATR?: number
  SMA20?: number
  SMA50?: number
  SMA200?: number
  ['52WeekLow']?: number
  ['52WeekHigh']?: number
}

export interface TechnicalStructure {
  support?: number[]
  resistance?: number[]
  breakout?: string | null
  volumeSpike?: boolean
  fibonacciLevels?: Record<string, number>
}

export interface TechnicalResult {
  score: number
  data?: TechnicalData
  symbol?: string
  currency?: string
  trend?: string
  signal?: string
  regime?: string
  reasons?: string[]
  indicators?: TechnicalIndicators
  structure?: TechnicalStructure
  ohlcv?: OhlcvPoint[]
}

export interface SentimentHeadline {
  title: string
  link: string
  source: string
  apiSource?: string
  publishedAt?: string
  published_at?: string
  pubDate?: string
  dateTimePub?: string
  dateTime?: string
  date?: string
  time?: string
  sentiment: string
  sentimentScore: number
}

export interface SentimentData {
  symbol: string
  count: number
}

export interface SentimentResult {
  data: SentimentData
  headlines: SentimentHeadline[]
  score: number
}

export interface ReportSections {
  overall: string
  fundamental: string
  technical: string
  sentiment: string
  riskFactors: string
  conclusion: string
  disclaimer: string
}

export interface AnalysisResponse {
  ticker: string
  overview: OverviewData
  fundamental: FundamentalResult | null
  technical: TechnicalResult | null
  sentiment: SentimentResult | null
  report?: string
  reportSections?: Partial<ReportSections>
  reportSource?: string
  error?: string
}

export interface SearchSuggestion {
  ticker: string
  name: string
  exchange?: string
  type?: string
}
