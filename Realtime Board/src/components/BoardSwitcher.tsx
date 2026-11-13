import { useEffect, useRef } from 'react'
import { boardHash } from '../lib/boardLink'
import { recentLabels, type RecentBoard } from '../lib/recentBoards'
import type { ID } from '../types'
import { goToNewBoard } from '../hooks/useBoardRoute'
import { useBoard } from '../hooks/useBoard'
import { useRecentBoards } from '../hooks/useRecentBoards'
import { isPlainClick, requestFocus } from '../utils/focusIntent'

/**
 * The open list floats over the board, so it has to get out of the way the
 * way any menu does: Escape (returning focus to its button), a click outside,
 * or focus moving on past it. A <details> does none of that by itself, and an
 * open list left covering the cards would hide whatever keyboard focus moves
 * onto next (WCAG 2.4.11).
 */
function BoardMenu({ recents, boardId }: { recents: readonly RecentBoard[]; boardId: ID }) {
  const menu = useRef<HTMLDetailsElement>(null)
  const labels = recentLabels(recents)

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const el = menu.current
      if (el?.open && !el.contains(event.target as Node)) el.open = false
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])

  return (
    <details
      className="switcher__menu"
      onBlur={(event) => {
        // relatedTarget is where focus is GOING; null means out of the page.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !event.currentTarget.open) return
        event.currentTarget.open = false
        event.currentTarget.querySelector('summary')?.focus()
      }}
      ref={menu}
    >
      <summary className="btn">Your boards</summary>
      <ul className="switcher__list">
        {recents.map((r) =>
          r.id === boardId ? (
            <li key={r.id}>
              <span aria-current="page" className="switcher__current">
                {labels.get(r.id)}
              </span>
            </li>
          ) : (
            <li key={r.id}>
              <a
                className="switcher__link"
                href={boardHash(r.id)}
                onClick={(event) => {
                  if (isPlainClick(event)) requestFocus()
                }}
              >
                {labels.get(r.id)}
              </a>
            </li>
          ),
        )}
      </ul>
    </details>
  )
}

/**
 * Every board this browser has opened, plus a way to start another.
 *
 * Links, not a <select>: a select that navigates on `change` jumps boards on
 * every arrow keypress in Chrome, Edge and Firefox on Windows, and each jump
 * remounts the board and drops focus (WCAG 3.2.2). A link only goes anywhere
 * when it is activated. Switching is plain navigation: the front door reads
 * the new address and mounts the board.
 */
export function BoardSwitcher() {
  const { boardId } = useBoard()
  const recents = useRecentBoards()
  const hasOthers = recents.some((r) => r.id !== boardId)

  return (
    <div className="switcher">
      {hasOthers ? <BoardMenu boardId={boardId} recents={recents} /> : null}
      <button className="btn" onClick={goToNewBoard} type="button">
        New board
      </button>
    </div>
  )
}
