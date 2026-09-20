import { useCallback } from 'react'
import { useLocalStorage } from './useLocalStorage'
import { MAX_HISTORY, STORAGE_KEYS } from '../constants'
import type { HistoryEntry } from '../types'

function uid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.round(Math.random() * 1e6)}`
}

/** Saved readings, newest first, capped to keep the list glanceable. */
export function useHistory() {
  const [entries, setEntries] = useLocalStorage<HistoryEntry[]>(STORAGE_KEYS.history, [])

  const add = useCallback(
    (entry: Omit<HistoryEntry, 'id' | 'at'>) => {
      setEntries((prev) => [{ ...entry, id: uid(), at: Date.now() }, ...prev].slice(0, MAX_HISTORY))
    },
    [setEntries],
  )

  const remove = useCallback(
    (id: string) => setEntries((prev) => prev.filter((e) => e.id !== id)),
    [setEntries],
  )

  const clear = useCallback(() => setEntries([]), [setEntries])

  return { entries, add, remove, clear }
}
