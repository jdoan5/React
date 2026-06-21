import { useEffect, useState } from 'react'
import type { Quote } from '../types'
import { massiveGet } from '../lib/massive'
import { parseQuote, type SnapshotResponse } from '../lib/transform'
import { mockQuote } from '../lib/mock'
import { UNIVERSE } from '../data/universe'

/** Latest quote for a symbol, falling back to demo data when the API is unavailable. */
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
        const json = await massiveGet<SnapshotResponse>(
          `/v2/snapshot/locale/us/markets/stocks/tickers/${symbol}`,
          controller.signal,
        )
        const q = parseQuote(symbol, json, name)
        if (!q.price) throw new Error('empty')
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
