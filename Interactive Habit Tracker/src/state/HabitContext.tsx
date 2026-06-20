import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react'
import type { HabitState } from '../types'
import type { Action } from './actions'
import { habitReducer } from './habitReducer'
import { createInitialState } from '../data/seed'
import { STORAGE_KEY } from '../constants'

interface HabitContextValue {
  state: HabitState
  dispatch: Dispatch<Action>
}

const HabitContext = createContext<HabitContextValue | null>(null)

function init(): HabitState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as HabitState
      if (parsed?.habits && Array.isArray(parsed.order) && parsed.completions) return parsed
    }
  } catch {
    // Corrupt/unavailable storage — fall through to seed data.
  }
  return createInitialState()
}

export function HabitProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(habitReducer, undefined, init)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Ignore quota / availability errors.
    }
  }, [state])

  // Keep multiple tabs in sync.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY || !event.newValue) return
      try {
        dispatch({ type: 'HYDRATE', state: JSON.parse(event.newValue) as HabitState })
      } catch {
        // Ignore malformed payloads.
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return <HabitContext.Provider value={{ state, dispatch }}>{children}</HabitContext.Provider>
}

export function useHabitContext(): HabitContextValue {
  const ctx = useContext(HabitContext)
  if (!ctx) throw new Error('useHabitContext must be used within <HabitProvider>')
  return ctx
}
