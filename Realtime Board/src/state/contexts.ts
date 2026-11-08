import { createContext } from 'react'
import type { Projection } from '../lib/project'
import type { SyncState } from './syncReducer'
import type { Command, CursorPing, SyncAdapter, SyncMode } from '../sync/adapter'
import type { Collaborator, ID } from '../types'

export interface BoardContextValue {
  readonly projection: Projection
  readonly state: SyncState
  readonly me: Collaborator | null
  readonly mode: SyncMode
  readonly reason: string
  readonly clientId: ID
  readonly adapter: SyncAdapter
  readonly boardId: ID
  /** Enqueue an intent. Applies optimistically on the next render. */
  readonly issue: (command: Command) => void
  readonly retire: (cmdIds: readonly ID[]) => void
}

export const BoardContext = createContext<BoardContextValue | null>(null)

/**
 * Cursor pings bypass the board context entirely.
 *
 * Subscribing returns an unsubscribe, rather than handing out a mutable ref:
 * the ref version worked, but writing through a value you got from useContext
 * is the kind of thing that is fine until someone memoises the provider value
 * and then is not.
 */
export type CursorSubscribe = (listener: (ping: CursorPing) => void) => () => void

export const CursorSubscribeContext = createContext<CursorSubscribe | null>(null)
