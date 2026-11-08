/**
 * The provider, and the only impure code in the whole sync path.
 *
 * Everything hard lives in pure modules; this file is wiring. It does exactly
 * three things:
 *
 *   1. connect — identify, fetch the snapshot, subscribe, and refetch on every
 *      reconnect (realtime guarantees no delivery and Postgres Changes has no
 *      replay, so every reconnect is a hole in the stream of unknown size)
 *   2. drain  — take the next due command, send it, dispatch the outcome
 *   3. expose — state and intent functions, through hooks
 *
 * Components never see a dispatch or an adapter.
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { backoffMs } from '../lib/backoff'
import { deserializeQueue, nextDue, serializeQueue, QUEUE_STORAGE_KEY } from '../lib/commandQueue'
import { project } from '../lib/project'
import { initialState, syncReducer } from './syncReducer'
import { createAdapter } from '../sync'
import { SyncRejection, type Command, type CursorPing, type LocalAdapterOptions } from '../sync/adapter'
import { BoardContext, CursorSubscribeContext, type BoardContextValue } from './contexts'
import { uuid } from '../utils/ids'
import type { Collaborator, ID } from '../types'


interface Props {
  boardId: ID
  children: ReactNode
  /** Demo-mode chaos knobs. Ignored when Supabase credentials are present. */
  localOptions?: LocalAdapterOptions
}

export function BoardProvider({ boardId, children, localOptions }: Props) {
  // One adapter for the lifetime of the provider. Re-creating it would drop the
  // socket and mint a new clientId, which would orphan every queued command.
  const [choice] = useState(() => createAdapter(localOptions))
  const { adapter, mode, reason } = choice

  const [state, dispatch] = useReducer(syncReducer, boardId, (id) => {
    const base = initialState(id)
    // Unsent commands survive a refresh. Absolute target state plus
    // client-minted ids make re-sending them safe either way.
    let queue = base.queue
    try {
      queue = deserializeQueue(localStorage.getItem(QUEUE_STORAGE_KEY))
    } catch {
      // A corrupt or foreign value under our key is not worth failing boot over.
    }
    return { ...base, queue }
  })

  const [me, setMe] = useState<Collaborator | null>(null)

  // --- connect -------------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    let teardown: (() => void) | undefined

    async function connect() {
      const identity = await adapter.identify(boardId)
      if (cancelled) return
      setMe(identity)

      const refetch = async () => {
        const snapshot = await adapter.fetchSnapshot(boardId)
        if (!cancelled) dispatch({ type: 'snapshot', snapshot })
      }

      teardown = adapter.subscribe(boardId, identity, {
        onStatus: (status, detail) => {
          if (!cancelled) dispatch({ type: 'status', status, detail })
        },
        onChange: (event) => {
          if (!cancelled) dispatch({ type: 'change', event, clientId: adapter.clientId })
        },
        onLive: () => {
          // Fires on first connect AND every reconnect — this is the backfill.
          void refetch()
        },
        onPresence: (roster) => {
          if (!cancelled) dispatch({ type: 'presence', roster: roster as never })
        },
        onCursor: (ping) => {
          // Routed past the reducer entirely; see hooks/useCursors.ts.
          for (const listener of cursorListeners.current) listener(ping)
        },
      })
    }

    void connect().catch((error: unknown) => {
      if (cancelled) return
      const message = error instanceof Error ? error.message : String(error)
      dispatch({ type: 'status', status: 'offline', detail: message })
    })

    return () => {
      cancelled = true
      teardown?.()
    }
  }, [adapter, boardId])

  // Cursor pings bypass the reducer entirely. A ref-held Set, so adding or
  // removing a subscriber never re-opens the socket.
  const cursorListeners = useRef(new Set<(ping: CursorPing) => void>())
  const subscribeCursors = useCallback((listener: (ping: CursorPing) => void) => {
    const listeners = cursorListeners.current
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  // --- persist the queue ---------------------------------------------------
  useEffect(() => {
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, serializeQueue(state.queue))
    } catch {
      // Quota or private mode: the queue stays in memory, which still works.
    }
  }, [state.queue])

  // --- drain ---------------------------------------------------------------
  // One in-flight write at a time, FIFO, so causality holds: a card.create can
  // never land after the card.move that depends on it.
  //
  // The guard is a ref rather than the effect's own cleanup. Dispatching
  // `inflight` changes state.queue, which re-runs this effect — and a cleanup
  // that cancelled the pending commit would therefore cancel the write it had
  // just started, leaving the card stuck on "saving…" forever. Ask me how I
  // know. Only unmount cancels.
  const committing = useRef(false)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  // Bumped to re-run the drain effect when a backoff timer expires. A plain
  // dispatch would not do it: the reducer returns the same state for a no-op,
  // so nothing would change and the effect would not re-run.
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!me || committing.current) return

    const envelope = nextDue(state.queue, Date.now())
    if (!envelope) {
      // Nothing due now. If something is waiting on a backoff, wake for it.
      const waiting = state.queue.order
        .map((id) => state.queue.byId[id])
        .filter((e) => e !== undefined && e.status === 'pending')
        .map((e) => e!.nextAttemptAt)
        .filter((at) => at > Date.now())
      if (waiting.length === 0) return
      const delay = Math.max(16, Math.min(...waiting) - Date.now())
      const timer = setTimeout(() => setTick((n) => n + 1), delay)
      return () => clearTimeout(timer)
    }

    committing.current = true
    dispatch({ type: 'queue', event: { type: 'inflight', cmdId: envelope.id, at: Date.now() } })

    adapter
      .commit(boardId, envelope)
      .then((result) => {
        if (!alive.current) return
        dispatch({
          type: 'committed',
          event: result.change,
          cmdId: envelope.id,
          clientId: adapter.clientId,
        })
      })
      .catch((error: unknown) => {
        if (!alive.current) return
        const rejection =
          error instanceof SyncRejection
            ? { reason: error.reason, message: error.message }
            : {
                reason: 'unavailable' as const,
                message: error instanceof Error ? error.message : String(error),
              }
        dispatch({
          type: 'queue',
          event: {
            type: 'nack',
            cmdId: envelope.id,
            rejection,
            retryable: rejection.reason === 'unavailable',
            at: Date.now(),
            // Computed here so commandQueue stays free of both the clock and
            // the retry schedule.
            backoffMs: backoffMs(envelope.attempts + 1, Math.random),
          },
        })
      })
      .finally(() => {
        committing.current = false
        // Re-run: the queue may already hold the next command.
        if (alive.current) setTick((n) => n + 1)
      })
  }, [adapter, boardId, me, state.queue, tick])

  const issue = useCallback(
    (command: Command) => {
      if (!me) return
      dispatch({
        type: 'queue',
        event: { type: 'enqueue', cmdId: uuid(), command, actorId: me.userId, at: Date.now() },
      })
    },
    [me],
  )

  const retire = useCallback((cmdIds: readonly ID[]) => {
    dispatch({ type: 'queue', event: { type: 'retire', cmdIds } })
  }, [])

  const projection = useMemo(
    () => project(state.snapshot, state.queue),
    [state.snapshot, state.queue],
  )

  const value = useMemo<BoardContextValue>(
    () => ({
      projection,
      state,
      me,
      mode,
      reason,
      clientId: adapter.clientId,
      adapter,
      boardId,
      issue,
      retire,
    }),
    [projection, state, me, mode, reason, adapter, boardId, issue, retire],
  )

  return (
    <BoardContext.Provider value={value}>
      <CursorSubscribeContext.Provider value={subscribeCursors}>
        {children}
      </CursorSubscribeContext.Provider>
    </BoardContext.Provider>
  )
}
