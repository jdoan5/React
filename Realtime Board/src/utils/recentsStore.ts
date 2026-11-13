/**
 * localStorage I/O for the recent-boards list. Impure, so it lives in utils/;
 * the list logic itself is pure in lib/recentBoards.ts.
 *
 * Shaped for useSyncExternalStore: `loadRecents` returns the SAME array until
 * the stored value actually changes (React re-renders forever otherwise), and
 * `subscribeRecents` fires on our own writes and on other tabs' writes.
 *
 * Every storage access is guarded. Private browsing and blocked storage throw
 * on access, and a missing list is only a missing convenience.
 */

import { parseRecents, RECENTS_STORAGE_KEY, serializeRecents, type RecentBoard } from '../lib/recentBoards'

const listeners = new Set<() => void>()
let cachedRaw: string | null | undefined
let cachedList: RecentBoard[] = []

function readRaw(): string | null {
  try {
    return localStorage.getItem(RECENTS_STORAGE_KEY)
  } catch {
    return null
  }
}

export function loadRecents(): RecentBoard[] {
  const raw = readRaw()
  if (raw !== cachedRaw) {
    cachedRaw = raw
    cachedList = parseRecents(raw)
  }
  return cachedList
}

export function saveRecents(list: readonly RecentBoard[]): void {
  try {
    localStorage.setItem(RECENTS_STORAGE_KEY, serializeRecents(list))
  } catch {
    return // nothing was written, so nothing changed
  }
  for (const listener of listeners) listener()
}

function onStorage(event: StorageEvent): void {
  // key === null means another tab cleared storage outright.
  if (event.key === RECENTS_STORAGE_KEY || event.key === null) {
    for (const listener of listeners) listener()
  }
}

export function subscribeRecents(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1) window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener('storage', onStorage)
  }
}
