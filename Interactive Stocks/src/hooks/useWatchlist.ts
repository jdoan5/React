import { useCallback } from 'react'
import { useLocalStorage } from './useLocalStorage'
import { DEFAULT_WATCHLIST, WATCHLIST_KEY } from '../constants'

export function useWatchlist() {
  const [symbols, setSymbols] = useLocalStorage<string[]>(WATCHLIST_KEY, DEFAULT_WATCHLIST)

  const has = useCallback((s: string) => symbols.includes(s), [symbols])
  const add = useCallback(
    (s: string) => setSymbols((prev) => (prev.includes(s) ? prev : [...prev, s])),
    [setSymbols],
  )
  const remove = useCallback((s: string) => setSymbols((prev) => prev.filter((x) => x !== s)), [setSymbols])
  const toggle = useCallback(
    (s: string) => setSymbols((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s])),
    [setSymbols],
  )

  return { symbols, has, add, remove, toggle }
}
