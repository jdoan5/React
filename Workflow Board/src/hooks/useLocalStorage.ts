import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'

/**
 * useState that persists to localStorage and stays in sync across browser tabs
 * (via the `storage` event). Used for UI preferences like "simulation on" and
 * "activity panel open".
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): readonly [T, Dispatch<SetStateAction<T>>, () => void] {
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
      // Ignore write failures (quota, private mode, etc.).
    }
  }, [key, value])

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== key || event.newValue === null) return
      try {
        setValue(JSON.parse(event.newValue) as T)
      } catch {
        // Ignore malformed payloads.
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key])

  const reset = useCallback(() => setValue(initialValue), [initialValue])
  return [value, setValue, reset] as const
}
