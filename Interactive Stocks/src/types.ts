// Domain model for Interactive Stocks.

export type RangeKey = '1W' | '1M' | '3M' | '1Y'

/** One OHLC bar. `t` is epoch milliseconds. */
export interface Bar {
  t: number
  o: number
  h: number
  l: number
  c: number
  v: number
}

export interface Quote {
  symbol: string
  name?: string
  price: number
  change: number
  changePct: number
  open: number
  high: number
  low: number
  prevClose: number
  volume: number
}

export interface Ticker {
  symbol: string
  name: string
}
