import { createContext } from 'react'
import type { Projection } from '../lib/project'
import type { SyncState } from './syncReducer'
import type { Command, CursorPing, SyncAdapter, SyncMode } from '../sync/adapter'
import type { Collaborator, ID } from '../types'

/**
 * A connect that failed outright. `terminal` separates "you may not open this"
 * (no invite, a dead link) from "the server did not answer" — only the first
 * should make the front door forget the board, or one network blip on load
 * would cost a visitor the only pointer they have to their own board.
 */
export interface BoardFailure {
  readonly message: string
  readonly terminal: boolean
}

export interface BoardContextValue {
  readonly projection: Projection
  readonly state: SyncState
  readonly me: Collaborator | null
  readonly mode: SyncMode
  readonly reason: string
  readonly clientId: ID
  readonly adapter: SyncAdapter
  readonly boardId: ID
  /** Why this board could not be opened at all, or null. See BoardProvider. */
  readonly failure: BoardFailure | null
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
