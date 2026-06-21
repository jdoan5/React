import type { RangeKey } from './types'

export const RANGES: { key: RangeKey; label: string; days: number }[] = [
  { key: '1W', label: '1W', days: 7 },
  { key: '1M', label: '1M', days: 30 },
  { key: '3M', label: '3M', days: 90 },
  { key: '1Y', label: '1Y', days: 365 },
]

export const DEFAULT_SYMBOL = 'AAPL'
export const WATCHLIST_KEY = 'interactive-stocks:watchlist:v1'
export const DEFAULT_WATCHLIST = ['AAPL', 'MSFT', 'NVDA']

/** Up/down semantic colours. */
export const UP = '#22c55e'
export const DOWN = '#ef4444'
