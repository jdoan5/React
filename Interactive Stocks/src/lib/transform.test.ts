import { describe, it, expect } from 'vitest'
import { bounds, buildChart, changeOf, parseBars, parseQuote, parseTickers, quoteFromBars } from './transform'

describe('bounds', () => {
  it('handles an empty series', () => {
    expect(bounds([])).toEqual({ min: 0, max: 1 })
  })
  it('expands a flat series so it has height', () => {
    const b = bounds([5, 5, 5])
    expect(b.min).toBeLessThan(5)
    expect(b.max).toBeGreaterThan(5)
  })
  it('finds the min and max', () => {
    expect(bounds([3, 1, 4, 1, 5])).toEqual({ min: 1, max: 5 })
  })
})

describe('changeOf', () => {
  it('is zero with fewer than two points', () => {
    expect(changeOf([5])).toEqual({ change: 0, pct: 0 })
  })
  it('computes an up move', () => {
    const r = changeOf([100, 110])
    expect(r.change).toBe(10)
    expect(r.pct).toBeCloseTo(10)
  })
  it('computes a down move', () => {
    expect(changeOf([100, 90]).change).toBe(-10)
  })
})

describe('buildChart', () => {
  it('maps every value to a point spanning the width', () => {
    const g = buildChart([1, 2, 3, 4], 300, 100)
    expect(g.points).toHaveLength(4)
    expect(g.points[0].x).toBe(0)
    expect(g.points[3].x).toBe(300)
    expect(g.line.startsWith('M')).toBe(true)
    expect(g.area.endsWith('Z')).toBe(true)
  })
  it('keeps y within the height', () => {
    for (const p of buildChart([10, 20, 5, 15], 200, 80).points) {
      expect(p.y).toBeGreaterThanOrEqual(0)
      expect(p.y).toBeLessThanOrEqual(80)
    }
  })
})

describe('parsers', () => {
  it('parseBars maps aggregate results', () => {
    const bars = parseBars({ results: [{ t: 1, o: 1, h: 2, l: 0.5, c: 1.5, v: 100 }] })
    expect(bars).toHaveLength(1)
    expect(bars[0].c).toBe(1.5)
  })
  it('parseBars tolerates a missing results array', () => {
    expect(parseBars({})).toEqual([])
  })
  it('parseTickers drops entries without a symbol', () => {
    const t = parseTickers({ results: [{ ticker: 'AAPL', name: 'Apple' }, { name: 'nope' }] })
    expect(t).toEqual([{ symbol: 'AAPL', name: 'Apple' }])
  })
  it('quoteFromBars derives a daily quote from the last two bars', () => {
    const q = quoteFromBars(
      'AAPL',
      [
        { t: 1, o: 100, h: 105, l: 99, c: 100, v: 1000 },
        { t: 2, o: 101, h: 110, l: 100, c: 108, v: 2000 },
      ],
      'Apple',
    )
    expect(q?.price).toBe(108)
    expect(q?.prevClose).toBe(100)
    expect(q?.change).toBeCloseTo(8)
    expect(q?.changePct).toBeCloseTo(8)
    expect(q?.volume).toBe(2000)
  })
  it('quoteFromBars returns null with no bars', () => {
    expect(quoteFromBars('X', [])).toBeNull()
  })
  it('parseQuote derives change from a snapshot', () => {
    const q = parseQuote(
      'AAPL',
      {
        ticker: {
          day: { o: 100, h: 110, l: 95, c: 108, v: 1000 },
          prevDay: { o: 90, h: 101, l: 89, c: 100, v: 900 },
          lastTrade: { p: 108 },
        },
      },
      'Apple',
    )
    expect(q.price).toBe(108)
    expect(q.prevClose).toBe(100)
    expect(q.change).toBeCloseTo(8)
    expect(q.changePct).toBeCloseTo(8)
  })
})
