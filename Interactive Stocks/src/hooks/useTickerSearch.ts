import { useEffect, useState } from 'react'
import type { Ticker } from '../types'
import { massiveGet } from '../lib/massive'
import { parseTickers, type TickersResponse } from '../lib/transform'
import { mockSearch } from '../lib/mock'

/** Debounced ticker search. Falls back to the demo universe on any API error. */
export function useTickerSearch(query: string, delay = 200) {
  const [results, setResults] = useState<Ticker[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const json = await massiveGet<TickersResponse>(
            `/v3/reference/tickers?search=${encodeURIComponent(q)}&active=true&market=stocks&limit=8`,
            controller.signal,
          )
          const parsed = parseTickers(json)
          setResults(parsed.length ? parsed : mockSearch(q))
        } catch (e) {
          if ((e as Error).name !== 'AbortError') setResults(mockSearch(q))
        } finally {
          setLoading(false)
        }
      })()
    }, delay)

    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [query, delay])

  return { results, loading }
}
