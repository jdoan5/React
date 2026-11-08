import { describe, expect, it } from 'vitest'
import { emptyQueue, queueReducer, type Queue } from './commandQueue'
import { mergeCard, project } from './project'
import type { BoardSnapshot, Command } from '../sync/adapter'
import type { CardRow, ColumnRow } from '../types'

const card = (id: string, columnId: string, orderKey: string, over: Partial<CardRow> = {}): CardRow => ({
  id,
  board_id: 'b',
  column_id: columnId,
  title: id,
  description: '',
  assignee_id: null,
  priority: 'medium',
  due_date: null,
  order_key: orderKey,
  archived_at: null,
  rev: 1,
  origin_client_id: null,
  origin_cmd_id: null,
  created_by: 'u',
  created_at: '',
  updated_at: '',
  ...over,
})

const column = (id: string, orderKey: string, over: Partial<ColumnRow> = {}): ColumnRow => ({
  id,
  board_id: 'b',
  title: id,
  order_key: orderKey,
  archived_at: null,
  rev: 1,
  origin_client_id: null,
  origin_cmd_id: null,
  updated_at: '',
  ...over,
})

function snapshot(over: Partial<BoardSnapshot> = {}): BoardSnapshot {
  return {
    boardId: 'b',
    title: 'Board',
    columns: { c1: column('c1', 'a0'), c2: column('c2', 'a1') },
    cards: {
      k1: card('k1', 'c1', 'a0'),
      k2: card('k2', 'c1', 'a1'),
      k3: card('k3', 'c2', 'a0'),
    },
    members: {},
    fetchedAt: 0,
    ...over,
  }
}

/** Enqueue commands in order, as the provider would. */
function queueOf(...commands: Command[]): Queue {
  let queue = emptyQueue()
  commands.forEach((command, i) => {
    queue = queueReducer(queue, { type: 'enqueue', cmdId: `cmd${i}`, command, actorId: 'u', at: i })
  })
  return queue
}

describe('project — the snapshot alone', () => {
  it('orders columns and cards by (order_key, id)', () => {
    const p = project(snapshot(), emptyQueue())
    expect(p.columnOrder).toEqual(['c1', 'c2'])
    expect(p.columns.c1!.cardIds).toEqual(['k1', 'k2'])
    expect(p.columns.c2!.cardIds).toEqual(['k3'])
  })

  it('marks nothing pending when the queue is empty', () => {
    const p = project(snapshot(), emptyQueue())
    expect(Object.values(p.cards).every((c) => !c.pending)).toBe(true)
  })

  it('leaves archived cards out of the order but keeps them addressable', () => {
    const snap = snapshot({
      cards: { k1: card('k1', 'c1', 'a0', { archived_at: '2026-01-01' }), k2: card('k2', 'c1', 'a1') },
    })
    const p = project(snap, emptyQueue())
    expect(p.columns.c1!.cardIds).toEqual(['k2'])
    expect(p.cards.k1).toBeDefined()
  })

  it('drops an archived column, and its cards with it', () => {
    const snap = snapshot({ columns: { c1: column('c1', 'a0', { archived_at: 'x' }), c2: column('c2', 'a1') } })
    const p = project(snap, emptyQueue())
    expect(p.columnOrder).toEqual(['c2'])
    expect(p.columns.c1).toBeUndefined()
  })

  it('ignores a card pointing at a column that no longer exists', () => {
    const snap = snapshot({ cards: { ghost: card('ghost', 'gone', 'a0') } })
    const p = project(snap, emptyQueue())
    expect(p.columnOrder).toEqual(['c1', 'c2'])
    expect(Object.values(p.columns).every((c) => c.cardIds.length === 0)).toBe(true)
  })
})

describe('project — optimistic apply', () => {
  it('shows a created card before the server has seen it', () => {
    const p = project(snapshot(), queueOf({ kind: 'card.create', cardId: 'new', columnId: 'c2', title: 'Fresh', orderKey: 'a1' }))
    expect(p.columns.c2!.cardIds).toEqual(['k3', 'new'])
    expect(p.cards.new!.title).toBe('Fresh')
    expect(p.cards.new!.pending).toBe(true)
  })

  it('moves a card across columns before confirmation', () => {
    const p = project(snapshot(), queueOf({ kind: 'card.move', cardId: 'k1', toColumnId: 'c2', orderKey: 'a2' }))
    expect(p.columns.c1!.cardIds).toEqual(['k2'])
    expect(p.columns.c2!.cardIds).toEqual(['k3', 'k1'])
    expect(p.cards.k1!.pending).toBe(true)
  })

  it('hides an archived card immediately', () => {
    const p = project(snapshot(), queueOf({ kind: 'card.archive', cardId: 'k1' }))
    expect(p.columns.c1!.cardIds).toEqual(['k2'])
  })

  it('applies commands in FIFO order, so the later edit of a field wins', () => {
    const p = project(
      snapshot(),
      queueOf(
        { kind: 'card.edit', cardId: 'k1', patch: { title: 'first' } },
        { kind: 'card.edit', cardId: 'k1', patch: { title: 'second' } },
      ),
    )
    expect(p.cards.k1!.title).toBe('second')
  })

  it('merges disjoint patches instead of letting one shadow the other', () => {
    const p = project(
      snapshot(),
      queueOf(
        { kind: 'card.edit', cardId: 'k1', patch: { title: 'renamed' } },
        { kind: 'card.edit', cardId: 'k1', patch: { priority: 'urgent' } },
      ),
    )
    expect(p.cards.k1!.title).toBe('renamed')
    expect(p.cards.k1!.priority).toBe('urgent')
  })

  it('ignores a command whose target is not in the snapshot', () => {
    const p = project(snapshot(), queueOf({ kind: 'card.move', cardId: 'nope', toColumnId: 'c1', orderKey: 'a9' }))
    expect(Object.keys(p.cards).sort()).toEqual(['k1', 'k2', 'k3'])
  })
})

describe('project — rollback is just re-projecting without the command', () => {
  it('restores the server state exactly when the command is dropped', () => {
    const snap = snapshot()
    const before = project(snap, emptyQueue())

    const queue = queueOf({ kind: 'card.move', cardId: 'k1', toColumnId: 'c2', orderKey: 'a2' })
    const during = project(snap, queue)
    expect(during.columns.c2!.cardIds).toContain('k1')

    // What rollback actually is: the envelope leaves the queue, nothing else.
    const rolledBack = project(snap, emptyQueue())
    expect(rolledBack.columns).toEqual(before.columns)
    expect(rolledBack.cards.k1!.column_id).toBe('c1')
  })

  it('skips a rejected command — a rejected write did not happen', () => {
    const snap = snapshot()
    let queue = queueOf({ kind: 'card.archive', cardId: 'k1' })
    const cmdId = queue.order[0]!
    queue = queueReducer(queue, { type: 'inflight', cmdId, at: 1 })
    queue = queueReducer(queue, {
      type: 'nack',
      cmdId,
      rejection: { reason: 'denied', message: 'no' },
      retryable: false,
      at: 2,
      backoffMs: 0,
    })
    expect(queue.byId[cmdId]!.status).toBe('rejected')

    const p = project(snap, queue)
    // The archive is not applied, so the card is still on the board...
    expect(p.columns.c1!.cardIds).toEqual(['k1', 'k2'])
    // ...and it is not marked pending either, because nothing is in flight for it.
    expect(p.cards.k1!.pending).toBe(false)
  })
})

describe('project — echo safety', () => {
  it("a collaborator's change lands under my pending edit; both survive", () => {
    // I have moved k1 to c2 and it has not been confirmed yet.
    const queue = queueOf({ kind: 'card.move', cardId: 'k1', toColumnId: 'c2', orderKey: 'a2' })

    // Meanwhile someone else renames the same card. That reaches the SNAPSHOT.
    const afterTheirEcho = snapshot({
      cards: {
        ...snapshot().cards,
        k1: card('k1', 'c1', 'a0', { title: 'Renamed by Bob', rev: 2 }),
      },
    })

    const p = project(afterTheirEcho, queue)
    // Their rename is visible...
    expect(p.cards.k1!.title).toBe('Renamed by Bob')
    // ...and my unconfirmed move is still applied on top of it.
    expect(p.columns.c2!.cardIds).toContain('k1')
    expect(p.cards.k1!.pending).toBe(true)
  })
})

describe('mergeCard', () => {
  it('returns the same reference when there is nothing to merge', () => {
    const row = card('k1', 'c1', 'a0')
    expect(mergeCard(row, [])).toBe(row)
  })

  it('applies patches left to right', () => {
    const row = card('k1', 'c1', 'a0')
    expect(mergeCard(row, [{ title: 'a' }, { title: 'b' }]).title).toBe('b')
  })

  it('treats an explicit null as a value, not an absence', () => {
    const row = card('k1', 'c1', 'a0', { assignee_id: 'u9' })
    expect(mergeCard(row, [{ assignee_id: null }]).assignee_id).toBeNull()
  })

  it('never mutates the row it was given', () => {
    const row = card('k1', 'c1', 'a0')
    mergeCard(row, [{ title: 'changed' }])
    expect(row.title).toBe('k1')
  })
})
