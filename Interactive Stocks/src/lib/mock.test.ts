import { describe, it, expect } from 'vitest'
import { mockBars, mockQuote, mockSearch } from './mock'

const NOW = 1_700_000_000_000

describe('mockBars', () => {
  it('is deterministic for the same symbol + range', () => {
    expect(mockBars('AAPL', '1M', NOW)).toEqual(mockBars('AAPL', '1M', NOW))
  })
  it('differs between symbols', () => {
    const a = mockBars('AAPL', '1M', NOW).map((b) => b.c)
    const b = mockBars('TSLA', '1M', NOW).map((b) => b.c)
    expect(a).not.toEqual(b)
  })
  it('has the expected length and sane values', () => {
    const bars = mockBars('NVDA', '1Y', NOW)
    expect(bars).toHaveLength(52)
    expect(bars.every((b) => b.c > 0 && b.h >= b.l)).toBe(true)
  })
})

describe('mockQuote', () => {
  it('is deterministic and resolves a company name', () => {
    const q = mockQuote('AAPL', NOW)
    expect(q).toEqual(mockQuote('AAPL', NOW))
    expect(q.name).toBe('Apple Inc.')
    expect(q.price).toBeGreaterThan(0)
  })
})

describe('mockSearch', () => {
  it('returns nothing for an empty query', () => {
    expect(mockSearch('   ')).toEqual([])
  })
  it('matches by symbol', () => {
    expect(mockSearch('AAPL')[0].symbol).toBe('AAPL')
  })
  it('matches by name, case-insensitively', () => {
    expect(mockSearch('tesla').some((t) => t.symbol === 'TSLA')).toBe(true)
  })
})
