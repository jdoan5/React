import type { Bar, Quote, Ticker } from '../types'

// ---- massive.com / Polygon-shaped response parsers -------------------------

interface AggResult { t: number; o: number; h: number; l: number; c: number; v: number }
export interface AggResponse { results?: AggResult[]; resultsCount?: number; ticker?: string }

export function parseBars(json: AggResponse): Bar[] {
  return (json.results ?? []).map((r) => ({ t: r.t, o: r.o, h: r.h, l: r.l, c: r.c, v: r.v }))
}

interface OHLCV { o: number; h: number; l: number; c: number; v: number }
interface SnapshotTicker {
  todaysChange?: number
  todaysChangePerc?: number
  day?: OHLCV
  prevDay?: OHLCV
  lastTrade?: { p: number }
  min?: { c: number }
}
export interface SnapshotResponse { ticker?: SnapshotTicker }

export function parseQuote(symbol: string, json: SnapshotResponse, name?: string): Quote {
  const t = json.ticker ?? {}
  const day = t.day ?? { o: 0, h: 0, l: 0, c: 0, v: 0 }
  const prev = t.prevDay ?? day
  const price = t.lastTrade?.p ?? t.min?.c ?? day.c ?? prev.c
  const prevClose = prev.c || price
  const change = t.todaysChange ?? price - prevClose
  const changePct = t.todaysChangePerc ?? (prevClose ? (change / prevClose) * 100 : 0)
  return {
    symbol,
    name,
    price,
    change,
    changePct,
    open: day.o || prevClose,
    high: day.h || price,
    low: day.l || price,
    prevClose,
    volume: day.v || 0,
  }
}

/**
 * Build a daily quote from a bar series (latest close vs the prior close). Used
 * instead of the realtime snapshot when that endpoint isn't on the API plan.
 */
export function quoteFromBars(symbol: string, bars: Bar[], name?: string): Quote | null {
  if (bars.length === 0) return null
  const last = bars[bars.length - 1]
  const prev = bars.length > 1 ? bars[bars.length - 2] : last
  const change = last.c - prev.c
  return {
    symbol,
    name,
    price: last.c,
    change,
    changePct: prev.c ? (change / prev.c) * 100 : 0,
    open: last.o,
    high: last.h,
    low: last.l,
    prevClose: prev.c,
    volume: last.v,
  }
}

interface TickerResult { ticker?: string; name?: string }
export interface TickersResponse { results?: TickerResult[] }

export function parseTickers(json: TickersResponse): Ticker[] {
  return (json.results ?? [])
    .filter((r): r is Required<TickerResult> => Boolean(r.ticker))
    .map((r) => ({ symbol: r.ticker, name: r.name || r.ticker }))
}

// ---- chart geometry (pure) -------------------------------------------------

export function closes(bars: Bar[]): number[] {
  return bars.map((b) => b.c)
}

export function bounds(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 1 }
  let min = values[0]
  let max = values[0]
  for (const v of values) {
    if (v < min) min = v
    if (v > max) max = v
  }
  if (min === max) {
    min -= 1
    max += 1
  }
  return { min, max }
}

export function changeOf(values: number[]): { change: number; pct: number } {
  if (values.length < 2) return { change: 0, pct: 0 }
  const first = values[0]
  const last = values[values.length - 1]
  const change = last - first
  return { change, pct: first ? (change / first) * 100 : 0 }
}

export interface ChartGeom {
  points: { x: number; y: number }[]
  line: string
  area: string
  min: number
  max: number
}

/** Map a value series to an SVG line + filled-area path within width × height. */
export function buildChart(values: number[], width: number, height: number): ChartGeom {
  const { min, max } = bounds(values)
  const n = values.length
  const span = max - min || 1
  const points = values.map((v, i) => ({
    x: n <= 1 ? 0 : (i / (n - 1)) * width,
    y: height - ((v - min) / span) * height,
  }))
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')
  const area = points.length
    ? `${line} L${width.toFixed(2)},${height.toFixed(2)} L0,${height.toFixed(2)} Z`
    : ''
  return { points, line, area, min, max }
}
