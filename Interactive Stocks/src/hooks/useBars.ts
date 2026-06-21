import { useEffect, useState } from 'react'
import type { Bar, RangeKey } from '../types'
import { massiveGet } from '../lib/massive'
import { parseBars, type AggResponse } from '../lib/transform'
import { mockBars } from '../lib/mock'
import { RANGES } from '../constants'
import { isoDay } from '../lib/format'

/** Daily OHLC bars for a symbol over the selected range, with demo fallback. */
export function useBars(symbol: string, range: RangeKey) {
  const [bars, setBars] = useState<Bar[]>([])
  const [loading, setLoading] = useState(true)
  const [isMock, setIsMock] = useState(false)

  useEffect(() => {
    if (!symbol) return
    setLoading(true)
    const controller = new AbortController()
    void (async () => {
      const days = RANGES.find((r) => r.key === range)?.days ?? 30
      const to = isoDay(Date.now())
      const from = isoDay(Date.now() - days * 86_400_000)
      try {
        const json = await massiveGet<AggResponse>(
          `/v2/aggs/ticker/${symbol}/range/1/day/${from}/${to}?adjusted=true&sort=asc&limit=5000`,
          controller.signal,
        )
        const parsed = parseBars(json)
        if (parsed.length < 2) throw new Error('insufficient')
        setBars(parsed)
        setIsMock(false)
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setBars(mockBars(symbol, range))
        setIsMock(true)
      } finally {
        setLoading(false)
      }
    })()
    return () => controller.abort()
  }, [symbol, range])

  return { bars, loading, isMock }
}
