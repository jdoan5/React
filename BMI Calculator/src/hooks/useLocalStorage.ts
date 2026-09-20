import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'

/** useState mirrored to localStorage, and synced across browser tabs. */
export function useLocalStorage<T>(key: string, initialValue: T): readonly [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw !== null ? (JSON.parse(raw) as T) : initialValue
    } catch {
      return initialValue
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // quota / private mode — in-memory state still works
    }
  }, [key, value])

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== key || e.newValue === null) return
      try {
        setValue(JSON.parse(e.newValue) as T)
      } catch {
        // ignore malformed payloads
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key])

  return [value, setValue] as const
}
