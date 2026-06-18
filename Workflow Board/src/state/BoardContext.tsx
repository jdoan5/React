import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react'
import type { BoardState } from '../types'
import type { Action } from './actions'
import { boardReducer } from './boardReducer'
import { createInitialState } from '../data/seed'
import { STORAGE_KEY } from '../constants'

interface BoardContextValue {
  state: BoardState
  dispatch: Dispatch<Action>
}

const BoardContext = createContext<BoardContextValue | null>(null)

/** Lazy initialiser: rehydrate from localStorage, or fall back to seed data. */
function init(): BoardState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as BoardState
      if (parsed?.columns && Array.isArray(parsed.columnOrder)) return parsed
    }
  } catch {
    // Corrupt or unavailable storage — fall through to seed data.
  }
  return createInitialState()
}

export function BoardProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(boardReducer, undefined, init)

  // Persist on every change.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Ignore quota / availability errors for this mock.
    }
  }, [state])

  // Cross-tab "multiplayer": when another tab saves, hydrate this one. Open the
  // app in two tabs, act as different people, and watch changes sync live.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== STORAGE_KEY || !event.newValue) return
      try {
        dispatch({ type: 'HYDRATE', state: JSON.parse(event.newValue) as BoardState })
      } catch {
        // Ignore malformed payloads.
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return <BoardContext.Provider value={{ state, dispatch }}>{children}</BoardContext.Provider>
}

/** Low-level accessor. Most components should use the richer hooks in /hooks. */
export function useBoardContext(): BoardContextValue {
  const ctx = useContext(BoardContext)
  if (!ctx) throw new Error('useBoardContext must be used within <BoardProvider>')
  return ctx
}
