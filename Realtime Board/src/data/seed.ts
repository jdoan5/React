import { keysBetween } from '../lib/fracIndex'
import type { BoardSnapshot, Card, Column, Priority } from '../types'

/**
 * The board a visitor sees with no credentials. Deterministic — no Math.random
 * and no Date.now — so the demo looks the same on every load and in screenshots.
 */

const COLUMN_TITLES = ['Backlog', 'In progress', 'In review', 'Done']

const CARDS: Array<{ column: number; title: string; priority: Priority; description: string }> = [
  { column: 0, title: 'Fractional index ordering', priority: 'high', description: 'Concurrent drags must not collide on an integer position.' },
  { column: 0, title: 'Share links with a token', priority: 'medium', description: 'Join goes through an RPC so the token is checked server-side.' },
  { column: 0, title: 'Archive instead of delete', priority: 'low', description: 'RLS cannot police a DELETE, and the event carries only the id.' },
  { column: 1, title: 'Optimistic apply + rollback', priority: 'urgent', description: 'The queue is separate from the snapshot, so an echo can never clobber an in-flight edit.' },
  { column: 1, title: 'Presence avatars', priority: 'medium', description: 'Collapse one person in several tabs into one collaborator.' },
  { column: 2, title: 'Row Level Security', priority: 'high', description: 'A security-definer helper breaks the boards/members recursion.' },
  { column: 3, title: 'Live cursors', priority: 'low', description: 'Broadcast at 20Hz, kept out of the board reducer entirely.' },
  { column: 3, title: 'Reconnect and backfill', priority: 'medium', description: 'Refetch on resubscribe; revisions make replayed events harmless.' },
]

export function demoSnapshot(boardId = 'demo-board'): BoardSnapshot {
  const columnKeys = keysBetween(null, null, COLUMN_TITLES.length)
  const columns: Record<string, Column> = {}
  COLUMN_TITLES.forEach((title, i) => {
    const id = `col-${i}`
    columns[id] = { id, title, orderKey: columnKeys[i]!, rev: 1 }
  })

  const cards: Record<string, Card> = {}
  COLUMN_TITLES.forEach((_, columnIndex) => {
    const inColumn = CARDS.filter((c) => c.column === columnIndex)
    const keys = keysBetween(null, null, inColumn.length)
    inColumn.forEach((card, i) => {
      const id = `card-${columnIndex}-${i}`
      cards[id] = {
        id,
        columnId: `col-${columnIndex}`,
        title: card.title,
        description: card.description,
        assigneeId: null,
        priority: card.priority,
        dueDate: null,
        orderKey: keys[i]!,
        rev: 1,
      }
    })
  })

  return { boardId, title: 'Realtime Board', columns, cards }
}
