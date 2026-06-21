import type { Bar, Quote, RangeKey, Ticker } from '../types'
import { RANGES } from '../constants'
import { UNIVERSE } from '../data/universe'

// Deterministic demo data so the app is fully usable without an API key. The
// price series is a seeded random walk — identical for the same (symbol, range).

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function basePrice(symbol: string): number {
  return 20 + (hashStr(symbol) % 480)
}

const POINTS: Record<RangeKey, number> = { '1W': 7, '1M': 30, '3M': 45, '1Y': 52 }

export function mockBars(symbol: string, range: RangeKey, now = Date.now()): Bar[] {
  const days = RANGES.find((r) => r.key === range)?.days ?? 30
  const points = POINTS[range]
  const rand = mulberry32(hashStr(`${symbol}:${range}`))
  const stepMs = (days * 86_400_000) / points
  let price = basePrice(symbol)
  const bars: Bar[] = []
  for (let i = 0; i < points; i += 1) {
    const o = price
    price = Math.max(1, price * (1 + (rand() - 0.48) * 0.03))
    const c = price
    const h = Math.max(o, c) * (1 + rand() * 0.012)
    const l = Math.min(o, c) * (1 - rand() * 0.012)
    const v = Math.floor(1_000_000 + rand() * 9_000_000)
    bars.push({ t: Math.round(now - (points - 1 - i) * stepMs), o, h, l, c, v })
  }
  return bars
}

export function mockQuote(symbol: string, now = Date.now()): Quote {
  const bars = mockBars(symbol, '1M', now)
  const last = bars[bars.length - 1]
  const prev = bars[bars.length - 2] ?? last
  const change = last.c - prev.c
  const name = UNIVERSE.find((u) => u.symbol === symbol)?.name ?? symbol
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

export function mockSearch(query: string): Ticker[] {
  const q = query.trim().toUpperCase()
  if (!q) return []
  return UNIVERSE.filter((u) => u.symbol.includes(q) || u.name.toUpperCase().includes(q)).slice(0, 8)
}
