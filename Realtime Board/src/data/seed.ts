/**
 * The board a visitor sees with no credentials.
 *
 * Returns ROWS, in exactly the shape Postgres would return them, so demo mode
 * and Supabase mode feed the projection identical input. Deterministic — no
 * Math.random, and a fixed epoch rather than Date.now — so the demo looks the
 * same on every load and in screenshots.
 */

import { keysBetween } from '../lib/fracIndex'
import type { CardRow, ColumnRow, ID, MemberRow, Priority } from '../types'

/** 2026-01-05T09:00:00Z. Fixed so seeded timestamps never drift. */
const EPOCH = new Date('2026-01-05T09:00:00Z').toISOString()

const BOARD_ID = 'demo-board'

const COLUMN_TITLES = ['Backlog', 'In progress', 'In review', 'Done']

const CARDS: Array<{ column: number; title: string; priority: Priority; description: string }> = [
  { column: 0, title: 'Fractional index ordering', priority: 'high', description: 'Concurrent drags must not collide on an integer position.' },
  { column: 0, title: 'Share links with a token', priority: 'medium', description: 'Joining goes through an RPC so the token is checked server-side.' },
  { column: 0, title: 'Archive instead of delete', priority: 'low', description: 'RLS cannot police a DELETE, and the event carries only the id.' },
  { column: 1, title: 'Optimistic apply and rollback', priority: 'urgent', description: 'The queue is separate from the snapshot, so an echo cannot clobber an in-flight edit.' },
  { column: 1, title: 'Presence avatars', priority: 'medium', description: 'One person in several tabs is one collaborator, not three.' },
  { column: 2, title: 'Row Level Security', priority: 'high', description: 'A security-definer helper breaks the boards/members recursion.' },
  { column: 3, title: 'Live cursors', priority: 'low', description: 'Broadcast at 20Hz, kept out of the board reducer entirely.' },
  { column: 3, title: 'Reconnect and backfill', priority: 'medium', description: 'Refetch on resubscribe; revisions make replayed events harmless.' },
]

export interface SeededBoard {
  boardId: ID
  title: string
  columns: Record<ID, ColumnRow>
  cards: Record<ID, CardRow>
  members: Record<ID, MemberRow>
}

export function demoBoard(): SeededBoard {
  const columnKeys = keysBetween(null, null, COLUMN_TITLES.length)
  const columns: Record<ID, ColumnRow> = {}
  COLUMN_TITLES.forEach((title, i) => {
    const id = `col-${i}`
    columns[id] = {
      id,
      board_id: BOARD_ID,
      title,
      order_key: columnKeys[i]!,
      archived_at: null,
      rev: 1,
      origin_client_id: null,
      origin_cmd_id: null,
      updated_at: EPOCH,
    }
  })

  const cards: Record<ID, CardRow> = {}
  COLUMN_TITLES.forEach((_, columnIndex) => {
    const inColumn = CARDS.filter((c) => c.column === columnIndex)
    const keys = keysBetween(null, null, inColumn.length)
    inColumn.forEach((card, i) => {
      const id = `card-${columnIndex}-${i}`
      cards[id] = {
        id,
        board_id: BOARD_ID,
        column_id: `col-${columnIndex}`,
        title: card.title,
        description: card.description,
        assignee_id: null,
        priority: card.priority,
        due_date: null,
        order_key: keys[i]!,
        archived_at: null,
        rev: 1,
        origin_client_id: null,
        origin_cmd_id: null,
        created_by: 'demo',
        created_at: EPOCH,
        updated_at: EPOCH,
      }
    })
  })

  return { boardId: BOARD_ID, title: 'Realtime Board', columns, cards, members: {} }
}

export const DEMO_BOARD_ID = BOARD_ID
