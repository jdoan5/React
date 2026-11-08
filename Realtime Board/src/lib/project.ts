/**
 * snapshot + queue -> the board the user sees.
 *
 * THE ONE RULE: an optimistic edit is NEVER written into the snapshot.
 *
 * The snapshot holds only what the server has confirmed. The queue holds only
 * what this client has asked for. They never touch, and the UI renders a
 * projection of the two. Everything hard falls out of that separation:
 *
 *   optimistic apply   enqueue a command; the projection shows it next render
 *   rollback           drop the command; re-project. No saved copy to restore.
 *   echo safety        a collaborator's change lands in the snapshot UNDERNEATH
 *                      my pending edit, so their rename and my move both survive
 *   retry              the command is still in the queue; nothing to reconstruct
 *
 * The alternative — writing optimistically into the cache and stashing a backup
 * to restore on failure — needs a cancel-in-flight-refetch interlock to stop a
 * concurrent echo clobbering the optimistic write. Here that interlock does not
 * exist because the problem does not.
 */

import type { BoardSnapshot, CardPatch, Command } from '../sync/adapter'
import type { CardRow, ColumnRow, ID, MemberRow } from '../types'
import type { Queue } from './commandQueue'
import { compareOrder } from './ordering'

export interface ProjectedCard extends CardRow {
  /** True while any command for this card is unconfirmed — drives the saving tick. */
  readonly pending: boolean
}

export interface ProjectedColumn extends ColumnRow {
  /** Ordered by (order_key, id). Archived cards excluded. */
  readonly cardIds: readonly ID[]
}

export interface Projection {
  readonly boardId: ID
  readonly title: string
  readonly columnOrder: readonly ID[]
  readonly columns: Readonly<Record<ID, ProjectedColumn>>
  readonly cards: Readonly<Record<ID, ProjectedCard>>
  readonly members: Readonly<Record<ID, MemberRow>>
}

/**
 * Per-field last-writer-wins over a row.
 *
 * Exported because the edit form needs the same merge to show what the user
 * typed while the write is still in the air, and two implementations of a merge
 * rule is one too many.
 */
export function mergeCard(row: CardRow, patches: readonly CardPatch[]): CardRow {
  if (patches.length === 0) return row
  let next = row
  for (const patch of patches) next = { ...next, ...patch }
  return next
}

/**
 * Apply one command to the working copy.
 *
 * Commands carry ABSOLUTE target state, so applying the same one twice is a
 * no-op rather than a corruption — which is what makes replay after a reload
 * safe, and what lets the queue coalesce three drags into one write.
 */
function applyCommand(
  command: Command,
  cards: Record<ID, CardRow>,
  columns: Record<ID, ColumnRow>,
  touched: Set<ID>,
): void {
  switch (command.kind) {
    case 'card.create': {
      touched.add(command.cardId)
      const existing = cards[command.cardId]
      if (existing) {
        cards[command.cardId] = {
          ...existing,
          column_id: command.columnId,
          order_key: command.orderKey,
        }
        return
      }
      // A placeholder that looks like a row, so the UI has nothing to special-case.
      // created_by is empty until the server fills it in; nothing renders it.
      cards[command.cardId] = {
        id: command.cardId,
        board_id: '',
        column_id: command.columnId,
        title: command.title,
        description: '',
        assignee_id: null,
        priority: 'medium',
        due_date: null,
        order_key: command.orderKey,
        archived_at: null,
        rev: 0,
        origin_client_id: null,
        origin_cmd_id: null,
        created_by: '',
        created_at: '',
        updated_at: '',
      }
      return
    }

    case 'card.move': {
      const card = cards[command.cardId]
      if (!card) return
      touched.add(command.cardId)
      cards[command.cardId] = {
        ...card,
        column_id: command.toColumnId,
        order_key: command.orderKey,
      }
      return
    }

    case 'card.edit': {
      const card = cards[command.cardId]
      if (!card) return
      touched.add(command.cardId)
      cards[command.cardId] = mergeCard(card, [command.patch])
      return
    }

    case 'card.archive': {
      const card = cards[command.cardId]
      if (!card) return
      touched.add(command.cardId)
      // A sentinel, not a real timestamp: the server assigns the actual value.
      // Only its presence is read, and only to filter the card out of the order.
      cards[command.cardId] = { ...card, archived_at: 'pending' }
      return
    }

    case 'column.create': {
      touched.add(command.columnId)
      const existing = columns[command.columnId]
      columns[command.columnId] = existing
        ? { ...existing, title: command.title, order_key: command.orderKey }
        : {
            id: command.columnId,
            board_id: '',
            title: command.title,
            order_key: command.orderKey,
            archived_at: null,
            rev: 0,
            origin_client_id: null,
            origin_cmd_id: null,
            updated_at: '',
          }
      return
    }

    case 'column.move': {
      const column = columns[command.columnId]
      if (!column) return
      touched.add(command.columnId)
      columns[command.columnId] = { ...column, order_key: command.orderKey }
      return
    }

    case 'column.rename': {
      const column = columns[command.columnId]
      if (!column) return
      touched.add(command.columnId)
      columns[command.columnId] = { ...column, title: command.title }
      return
    }

    case 'column.archive': {
      const column = columns[command.columnId]
      if (!column) return
      touched.add(command.columnId)
      columns[command.columnId] = { ...column, archived_at: 'pending' }
      return
    }
  }
}

/**
 * Collapse the snapshot and the queue into what renders.
 *
 * Commands replay in FIFO order, so a later edit of the same field wins — the
 * same order the server will see them in, which is why the optimistic result
 * matches the confirmed one.
 *
 * REJECTED commands are deliberately skipped. A rejected write did not happen,
 * so showing it would be a lie; the envelope stays in the queue only so the UI
 * can tell the user about it.
 */
export function project(snapshot: BoardSnapshot, queue: Queue): Projection {
  const cards: Record<ID, CardRow> = { ...snapshot.cards }
  const columns: Record<ID, ColumnRow> = { ...snapshot.columns }
  const touched = new Set<ID>()

  for (const cmdId of queue.order) {
    const envelope = queue.byId[cmdId]
    if (!envelope || envelope.status === 'rejected') continue
    applyCommand(envelope.command, cards, columns, touched)
  }

  // Columns first: a card in an archived column must not render anywhere.
  const liveColumns = Object.values(columns).filter((c) => c.archived_at === null)
  const columnOrder = liveColumns
    .map((c) => ({ id: c.id, orderKey: c.order_key }))
    .sort(compareOrder)
    .map((c) => c.id)
  const liveColumnIds = new Set(columnOrder)

  const grouped: Record<ID, Array<{ id: ID; orderKey: string }>> = {}
  for (const id of columnOrder) grouped[id] = []

  const projectedCards: Record<ID, ProjectedCard> = {}
  for (const card of Object.values(cards)) {
    projectedCards[card.id] = { ...card, pending: touched.has(card.id) }
    if (card.archived_at !== null) continue
    const bucket = grouped[card.column_id]
    if (!bucket) continue // card points at an archived or unknown column
    bucket.push({ id: card.id, orderKey: card.order_key })
  }

  const projectedColumns: Record<ID, ProjectedColumn> = {}
  for (const column of liveColumns) {
    if (!liveColumnIds.has(column.id)) continue
    projectedColumns[column.id] = {
      ...column,
      cardIds: (grouped[column.id] ?? []).sort(compareOrder).map((c) => c.id),
    }
  }

  return {
    boardId: snapshot.boardId,
    title: snapshot.title,
    columnOrder,
    columns: projectedColumns,
    cards: projectedCards,
    members: snapshot.members,
  }
}
