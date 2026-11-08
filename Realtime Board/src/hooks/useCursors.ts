import { useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { CURSOR_TTL_MS, mergeCursor, pruneCursors, shouldSend } from '../lib/cursors'
import { CursorSubscribeContext } from '../state/contexts'
import { useBoardContext } from './useBoard'
import type { CursorPing } from '../sync/adapter'
import type { ID } from '../types'

/**
 * Cursors are deliberately NOT in the board reducer.
 *
 * At 20Hz with four people on a board that is 80 state updates a second, and
 * every one of them would re-run project(snapshot, queue) and re-render the
 * whole board for something that only moves a few absolutely-positioned divs.
 *
 * So they live in a tiny external store: CursorLayer subscribes to it and
 * nothing else does, which means a cursor frame repaints the cursor layer and
 * touches nothing else.
 */
function createCursorStore() {
  let cursors: Readonly<Record<ID, CursorPing>> = {}
  const listeners = new Set<() => void>()

  const emit = () => {
    for (const listener of listeners) listener()
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot() {
      return cursors
    },
    receive(ping: CursorPing) {
      const next = mergeCursor(cursors, ping)
      if (next === cursors) return // stale or out-of-order ping
      cursors = next
      emit()
    },
    prune(now: number) {
      const next = pruneCursors(cursors, now)
      if (next === cursors) return
      cursors = next
      emit()
    },
  }
}

export function useCursors() {
  const { adapter, boardId, me } = useBoardContext()
  const subscribeCursors = useContext(CursorSubscribeContext)
  const store = useMemo(() => createCursorStore(), [])
  const lastSentAt = useRef(0)

  // Wire the adapter's cursor callback straight into the store, past the reducer.
  useEffect(() => {
    if (!subscribeCursors) return
    return subscribeCursors((ping: CursorPing) => store.receive(ping))
  }, [subscribeCursors, store])

  // A peer that closed its tab stops sending but never says goodbye, so stale
  // cursors are swept on a timer rather than on an event.
  useEffect(() => {
    const timer = setInterval(() => store.prune(Date.now()), CURSOR_TTL_MS / 2)
    return () => clearInterval(timer)
  }, [store])

  const cursors = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)

  const sendCursor = useCallback(
    (x: number, y: number, draggingCardId: ID | null) => {
      if (!me) return
      const now = Date.now()
      if (!shouldSend(lastSentAt.current, now)) return
      lastSentAt.current = now
      adapter.sendCursor(boardId, { userId: me.userId, x, y, draggingCardId, at: now })
    },
    [adapter, boardId, me],
  )

  return { cursors, sendCursor }
}
