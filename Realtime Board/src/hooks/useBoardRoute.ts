/**
 * The front door: turns the address bar (and this browser's recent boards)
 * into one board to open — creating it first when there is nothing to open.
 *
 * Supabase mode only. Demo mode has a single seeded board and skips this.
 * Every decision is made by the pure lib/frontDoor.ts; this hook only reads
 * `location`, writes history, and calls create_board().
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { boardHash, parseBoardHash } from '../lib/boardLink'
import { INVALID_LINK_MESSAGE, resolveTarget } from '../lib/frontDoor'
import { rememberBoard } from '../lib/recentBoards'
import type { BoardDirectory, NewBoard } from '../sync/adapter'
import { requestFocus } from '../utils/focusIntent'
import { loadRecents, saveRecents } from '../utils/recentsStore'
import type { ID } from '../types'

export interface RouteAction {
  readonly label: string
  readonly run: () => void
}

export type BoardRouteState =
  | { readonly status: 'resolving' }
  | { readonly status: 'ready'; readonly boardId: ID; readonly invite: string | null }
  | { readonly status: 'error'; readonly message: string; readonly action: RouteAction }

/** Navigate to a board this browser already belongs to. */
export function goToBoard(boardId: ID): void {
  requestFocus()
  window.location.hash = boardHash(boardId)
}

/** Navigate to `#new`, which makes the front door create a board. */
export function goToNewBoard(): void {
  requestFocus()
  window.location.hash = 'new'
}

export function useBoardRoute(directory: BoardDirectory): BoardRouteState {
  const [hash, setHash] = useState(() => window.location.hash)
  const [attempt, setAttempt] = useState(0)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    const onHashChange = () => {
      setCreateError(null)
      setHash(window.location.hash)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const route = useMemo(() => parseBoardHash(hash), [hash])
  // Recents are consulted when the address changes, not on every render.
  const target = useMemo(() => resolveTarget(route, loadRecents()), [route])

  // Resumed from history with an empty fragment: write the board into the
  // address bar, so a reload or a bookmark lands on the same board. Cosmetic,
  // so no state change — the target is already decided.
  useEffect(() => {
    if (route.kind === 'none' && target.kind === 'open') {
      window.history.replaceState(null, '', boardHash(target.boardId))
    }
  }, [route, target])

  // Keyed on address + attempt, and held in a ref, so React StrictMode's
  // double run of this effect shares ONE create_board() call. Two calls would
  // make two boards and orphan the first.
  const creating = useRef<{ key: string; promise: Promise<NewBoard> } | null>(null)

  useEffect(() => {
    if (target.kind !== 'create') return
    const key = `${hash}|${attempt}`
    if (creating.current?.key !== key) {
      creating.current = { key, promise: directory.createBoard() }
    }
    let cancelled = false
    // Bookkeeping runs whether or not this effect is still current; only the
    // navigation is gated on `cancelled`. Otherwise a create the user walked
    // away from (pressed Back mid-create) would leave its settled promise in
    // the ref — a failure re-shown on the next "New board" click without a
    // request, or a success orphaned: a board on the server nobody can reach.
    const settle = () => {
      if (creating.current?.key === key) creating.current = null
    }
    creating.current.promise.then(
      (board) => {
        settle()
        saveRecents(rememberBoard(loadRecents(), { id: board.boardId, title: board.title }, Date.now()))
        if (cancelled) return
        // The address bar now holds the board's invite link, so copying it
        // from there works as well as the button does. replaceState, not a
        // hash assignment: `#new` should not sit in the back-button history.
        const next = boardHash(board.boardId, board.invite)
        window.history.replaceState(null, '', next)
        setHash(next)
      },
      (error: unknown) => {
        settle()
        if (cancelled) return
        setCreateError(error instanceof Error ? error.message : String(error))
      },
    )
    return () => {
      cancelled = true
    }
  }, [target, hash, attempt, directory])

  const retry = useCallback(() => {
    requestFocus()
    setCreateError(null)
    setAttempt((n) => n + 1)
  }, [])

  switch (target.kind) {
    case 'invalid':
      return {
        status: 'error',
        message: INVALID_LINK_MESSAGE,
        action: { label: 'Start a new board', run: goToNewBoard },
      }
    case 'create':
      return createError
        ? { status: 'error', message: createError, action: { label: 'Try again', run: retry } }
        : { status: 'resolving' }
    case 'open':
      return { status: 'ready', boardId: target.boardId, invite: target.invite }
  }
}
