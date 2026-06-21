import { useEffect, useState } from 'react'
import type { Quote } from '../types'
import { massiveGet } from '../lib/massive'
import { parseBars, quoteFromBars, type AggResponse } from '../lib/transform'
import { mockQuote } from '../lib/mock'
import { isoDay } from '../lib/format'
import { UNIVERSE } from '../data/universe'

/**
 * Latest daily quote for a symbol, derived from the (widely-entitled) daily
 * aggregates endpoint. Falls back to demo data when the API is unavailable.
 */
export function useQuote(symbol: string) {
  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)
  const [isMock, setIsMock] = useState(false)

  useEffect(() => {
    if (!symbol) return
    setLoading(true)
    const controller = new AbortController()
    void (async () => {
      const name = UNIVERSE.find((u) => u.symbol === symbol)?.name
      try {
        const to = isoDay(Date.now())
        const from = isoDay(Date.now() - 16 * 86_400_000)
        const json = await massiveGet<AggResponse>(
          `/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=60`,
          controller.signal,
        )
        const q = quoteFromBars(symbol, parseBars(json), name)
        if (!q || !q.price) throw new Error('empty')
        setQuote(q)
        setIsMock(false)
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setQuote(mockQuote(symbol))
        setIsMock(true)
      } finally {
        setLoading(false)
      }
    })()
    return () => controller.abort()
  }, [symbol])

  return { quote, loading, isMock }
}
