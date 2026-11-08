/**
 * The composition root — and still pure.
 *
 * It holds no adapter, imports nothing that can touch a network, and never
 * reads a clock: every action that needs the time carries it. Snapshot folding
 * is delegated to reconcile.ts and queue bookkeeping to commandQueue.ts; this
 * file only decides which of them an action reaches, and in what order.
 *
 * The four slices are deliberately independent. In particular `snapshot` and
 * `queue` never touch: the server writes one, the local user writes the other,
 * and what renders is project(snapshot, queue). Cursors are NOT here — a 20Hz
 * cursor stream must never re-project the board, so they live in their own
 * store (hooks/useCursors.ts).
 */

import { ackedCommands, emptySnapshot, reconcile } from '../lib/reconcile'
import { emptyQueue, queueReducer, type Queue, type QueueEvent } from '../lib/commandQueue'
import type { RosterEntry } from '../lib/presence'
import type { BoardSnapshot, ChangeEvent, SyncStatus } from '../sync/adapter'
import type { ID } from '../types'

export interface SyncState {
  readonly snapshot: BoardSnapshot
  readonly queue: Queue
  readonly presence: readonly RosterEntry[]
  readonly status: SyncStatus
  /** Set when the adapter reports a problem worth showing. Cleared on recovery. */
  readonly detail: string | null
}

export type SyncAction =
  | { type: 'snapshot'; snapshot: BoardSnapshot }
  /** A row change from the server. Carries clientId so the reducer can self-ack. */
  | { type: 'change'; event: ChangeEvent; clientId: ID }
  | { type: 'status'; status: SyncStatus; detail?: string }
  | { type: 'presence'; roster: readonly RosterEntry[] }
  /** Anything the command queue owns, forwarded verbatim. */
  | { type: 'queue'; event: QueueEvent }
  /**
   * A commit came back. The snapshot advances AND the command is acked in ONE
   * dispatch, so there is never a frame where the row has landed but the
   * optimistic copy is still layered on top of it — which would show the user a
   * flicker of double-applied state.
   */
  | { type: 'committed'; event: ChangeEvent; cmdId: ID; clientId: ID }

export function initialState(boardId: ID): SyncState {
  return {
    snapshot: emptySnapshot(boardId),
    queue: emptyQueue(),
    presence: [],
    status: 'connecting',
    detail: null,
  }
}

export function syncReducer(state: SyncState, action: SyncAction): SyncState {
  switch (action.type) {
    case 'snapshot':
      return { ...state, snapshot: action.snapshot }

    case 'change': {
      const snapshot = reconcile(state.snapshot, action.event)
      // reconcile returns the SAME reference for a stale event, which is the
      // cheap way to know nothing happened.
      const acked = ackedCommands(action.event, action.clientId)
      if (snapshot === state.snapshot && acked.length === 0) return state
      return {
        ...state,
        snapshot,
        queue: acked.length > 0 ? queueReducer(state.queue, { type: 'ack', cmdIds: acked }) : state.queue,
      }
    }

    case 'committed': {
      const snapshot = reconcile(state.snapshot, action.event)
      return {
        ...state,
        snapshot,
        queue: queueReducer(state.queue, { type: 'ack', cmdIds: [action.cmdId] }),
      }
    }

    case 'status':
      if (state.status === action.status && state.detail === (action.detail ?? null)) return state
      return { ...state, status: action.status, detail: action.detail ?? null }

    case 'presence':
      return { ...state, presence: action.roster }

    case 'queue': {
      const queue = queueReducer(state.queue, action.event)
      return queue === state.queue ? state : { ...state, queue }
    }
  }
}
