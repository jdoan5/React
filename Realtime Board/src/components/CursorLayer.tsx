import { usePresence } from '../hooks/usePresence'
import type { CursorPing } from '../sync/adapter'
import type { ID } from '../types'

interface Props {
  cursors: Readonly<Record<ID, CursorPing>>
}

/**
 * The only thing that re-renders on a cursor frame.
 *
 * Cursors come from their own external store rather than the board reducer, so
 * a 20Hz stream from four people repaints these few absolutely-positioned divs
 * and never re-projects the board.
 */
export function CursorLayer({ cursors }: Props) {
  const { roster } = usePresence()
  const entries = Object.values(cursors)
  if (entries.length === 0) return null

  return (
    <div className="cursors" aria-hidden>
      {entries.map((ping) => {
        const person = roster.find((p) => p.userId === ping.userId)
        if (!person || person.isSelf) return null
        return (
          <div
            className="cursor"
            key={ping.userId}
            style={{ left: `${ping.x * 100}%`, top: `${ping.y * 100}%`, color: person.color }}
          >
            <svg viewBox="0 0 12 12" width="14" height="14">
              <path d="M1 1 L1 10 L4 7.5 L6 11 L7.5 10.2 L5.6 6.8 L9.5 6.5 Z" fill="currentColor" />
            </svg>
            <span className="cursor__label" style={{ background: person.color }}>
              {person.name}
              {ping.draggingCardId ? ' · dragging' : ''}
            </span>
          </div>
        )
      })}
    </div>
  )
}
