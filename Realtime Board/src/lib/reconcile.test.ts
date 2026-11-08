import { describe, expect, it } from 'vitest'
import { ackedCommands, emptySnapshot, reconcile, snapshotFromRows } from './reconcile'
import type { BoardSnapshot, ChangeEvent, Origin } from '../sync/adapter'
import type { CardRow, ColumnRow, ID, MemberRow } from '../types'

const BOARD = 'board-1'
const OTHER_BOARD = 'board-2'
const ME = 'client-mine'
const BOB = 'client-bob'
const T = '2026-01-01T00:00:00Z'

function card(id: ID, over: Partial<CardRow> = {}): CardRow {
  return {
    id,
    board_id: BOARD,
    column_id: 'col-todo',
    title: id,
    description: '',
    assignee_id: null,
    priority: 'medium',
    due_date: null,
    order_key: 'a0',
    archived_at: null,
    rev: 1,
    origin_client_id: null,
    origin_cmd_id: null,
    created_by: 'user-1',
    created_at: T,
    updated_at: T,
    ...over,
  }
}

function column(id: ID, over: Partial<ColumnRow> = {}): ColumnRow {
  return {
    id,
    board_id: BOARD,
    title: id,
    order_key: 'a0',
    archived_at: null,
    rev: 1,
    origin_client_id: null,
    origin_cmd_id: null,
    updated_at: T,
    ...over,
  }
}

function member(userId: ID, over: Partial<MemberRow> = {}): MemberRow {
  return {
    board_id: BOARD,
    user_id: userId,
    role: 'editor',
    display_name: userId,
    color: '#aabbcc',
    joined_at: T,
    ...over,
  }
}

const NO_ORIGIN: Origin = { originClientId: null, originCmdId: null }

/** Written by me, answering command `cmdId` — the shape an ack has to recognise. */
function mine(cmdId: ID): Origin {
  return { originClientId: ME, originCmdId: cmdId }
}

function cardChange(
  operation: 'INSERT' | 'UPDATE',
  record: CardRow,
  origin: Origin = NO_ORIGIN,
  boardId: ID = BOARD,
): ChangeEvent {
  return {
    table: 'cards',
    boardId,
    operation,
    record,
    // An UPDATE carries a primary-key-only `old_record`; an INSERT carries none.
    old_record: operation === 'UPDATE' ? { id: record.id } : null,
    ...origin,
  }
}

function columnChange(
  operation: 'INSERT' | 'UPDATE',
  record: ColumnRow,
  origin: Origin = NO_ORIGIN,
): ChangeEvent {
  return {
    table: 'columns',
    boardId: BOARD,
    operation,
    record,
    old_record: operation === 'UPDATE' ? { id: record.id } : null,
    ...origin,
  }
}

function memberChange(
  operation: 'INSERT' | 'UPDATE',
  record: MemberRow,
  origin: Origin = NO_ORIGIN,
): ChangeEvent {
  return {
    table: 'board_members',
    boardId: BOARD,
    operation,
    record,
    old_record: operation === 'UPDATE' ? { id: record.user_id } : null,
    ...origin,
  }
}

/** A DELETE only ever carries the primary key, which is the point of the test below. */
function cardDelete(id: ID, origin: Origin = NO_ORIGIN, boardId: ID = BOARD): ChangeEvent {
  return { table: 'cards', boardId, operation: 'DELETE', record: null, old_record: { id }, ...origin }
}

function board(
  rows: {
    columns?: readonly ColumnRow[]
    cards?: readonly CardRow[]
    members?: readonly MemberRow[]
  } = {},
  fetchedAt = 1000,
): BoardSnapshot {
  return snapshotFromRows(
    BOARD,
    'Sprint 12',
    { columns: rows.columns ?? [], cards: rows.cards ?? [], members: rows.members ?? [] },
    fetchedAt,
  )
}

describe('emptySnapshot', () => {
  it('is empty but well formed, so the UI can render before the first fetch', () => {
    const snap = emptySnapshot(BOARD)
    expect(snap.boardId).toBe(BOARD)
    expect(snap.cards).toEqual({})
    expect(snap.columns).toEqual({})
    expect(snap.members).toEqual({})
  })

  it('dates itself to 0, so any real fetch counts as newer', () => {
    // The reducer drops an arriving snapshot older than the one it holds, which is
    // what stops a slow reconnect fetch from overwriting a newer one. Zero means
    // that rule needs no special case for the pre-fetch state.
    expect(emptySnapshot(BOARD).fetchedAt).toBe(0)
  })
})

describe('snapshotFromRows', () => {
  it('keys cards and columns by id', () => {
    const snap = board({ cards: [card('c1'), card('c2')], columns: [column('col-todo')] })
    expect(Object.keys(snap.cards)).toEqual(['c1', 'c2'])
    expect(snap.cards['c2']!.id).toBe('c2')
    expect(snap.columns['col-todo']!.id).toBe('col-todo')
  })

  it('keys members by user_id, because board_members has no id column', () => {
    // Its primary key is (board_id, user_id); within one board's snapshot the user
    // is the identity.
    const snap = board({ members: [member('u1'), member('u2')] })
    expect(Object.keys(snap.members)).toEqual(['u1', 'u2'])
    expect(snap.members['u1']!.user_id).toBe('u1')
  })

  it('uses the fetchedAt it was given rather than reading a clock', () => {
    expect(board({}, 42).fetchedAt).toBe(42)
    expect(board({}, 0).fetchedAt).toBe(0)
  })

  it('copies the rows out, so the caller can reuse its arrays', () => {
    const cards = [card('c1')]
    const snap = board({ cards })
    cards.push(card('c2'))
    expect(Object.keys(snap.cards)).toEqual(['c1'])
  })

  it('drops rows that no longer exist, so a card archived while I was offline disappears', () => {
    // A replacement is a replacement. This is the only repair mechanism for the
    // events Realtime never promised to deliver, so it must not merge with what we
    // already hold — a row missing from fresh truth is gone.
    const before = board({ cards: [card('c1'), card('c2')] })
    const after = board({ cards: [card('c1')] }, 2000)
    expect(before.cards['c2']).toBeDefined()
    expect(after.cards['c2']).toBeUndefined()
    expect(after.cards['c1']).toBeDefined()
  })
})

describe('reconcile — monotonicity by rev', () => {
  it('returns the SAME snapshot for an event at the rev already held, so React skips the render', () => {
    const snap = board({ cards: [card('c1', { rev: 5, title: 'Fix login' })] })
    const echo = reconcile(snap, cardChange('UPDATE', card('c1', { rev: 5, title: 'Clobbered' })))
    expect(echo).toBe(snap)
  })

  it('returns the SAME snapshot for an event BELOW the rev already held', () => {
    const snap = board({ cards: [card('c1', { rev: 9, order_key: 'a1' })] })
    const stale = reconcile(snap, cardChange('UPDATE', card('c1', { rev: 7, order_key: 'a5' })))
    expect(stale).toBe(snap)
    expect(stale.cards['c1']!.order_key).toBe('a1')
  })

  it('replaying the identical INSERT changes nothing and returns the same reference', () => {
    const row = card('c1', { rev: 1 })
    const once = reconcile(board(), cardChange('INSERT', row))
    expect(once.cards['c1']).toBe(row)
    expect(reconcile(once, cardChange('INSERT', row))).toBe(once)
  })

  it('cannot move the board backwards when a reconnect delivers events out of order', () => {
    // The property the whole module exists for: after the hole in the stream, the
    // board holds the highest rev it has seen, whatever order the events arrived in.
    const start = board({ cards: [card('c1', { rev: 6, order_key: 'a5' })] })
    const revs: Array<[number, string]> = [
      [9, 'a9'],
      [7, 'a7'],
      [8, 'a8'],
      [6, 'a6'],
    ]
    let snap = start
    for (const [rev, orderKey] of revs) {
      snap = reconcile(snap, cardChange('UPDATE', card('c1', { rev, order_key: orderKey })))
    }
    expect(snap.cards['c1']!.rev).toBe(9)
    expect(snap.cards['c1']!.order_key).toBe('a9')
  })

  it('advances on a higher rev by replacing the row WHOLESALE, not merging fields', () => {
    // Field-level merging is the queue's job in project(). The snapshot holds exactly
    // what the server last said, or the two layers would disagree about who owns a field.
    const snap = board({
      cards: [card('c1', { rev: 4, title: 'Old', description: 'notes', priority: 'urgent' })],
    })
    const next = reconcile(snap, cardChange('UPDATE', card('c1', { rev: 5, title: 'New' })))
    expect(next).not.toBe(snap)
    expect(next.cards['c1']!.title).toBe('New')
    expect(next.cards['c1']!.description).toBe('')
    expect(next.cards['c1']!.priority).toBe('medium')
  })

  it('does not let an INSERT clobber a row we already hold at a higher rev', () => {
    // A duplicate INSERT is reachable: a retried create is an upsert on a
    // client-minted id, and the stream may replay the original after the retry.
    const snap = board({ cards: [card('c1', { rev: 3, title: 'Edited since' })] })
    const next = reconcile(snap, cardChange('INSERT', card('c1', { rev: 1, title: 'Original' })))
    expect(next).toBe(snap)
    expect(next.cards['c1']!.title).toBe('Edited since')
  })

  it('treats an UPDATE for an unknown row as an insert, because delivery is not guaranteed', () => {
    // We may simply never have been handed the INSERT. Refusing the UPDATE would
    // leave the card invisible until the next refetch.
    const next = reconcile(board(), cardChange('UPDATE', card('c1', { rev: 4 })))
    expect(next.cards['c1']!.rev).toBe(4)
  })
})

describe('reconcile — scoping to one board', () => {
  it('ignores an event for another board and returns the same reference', () => {
    // A reused channel whose teardown was missed presents exactly as cross-board events.
    const snap = board({ cards: [card('c1')] })
    const foreign = cardChange('INSERT', card('x1', { board_id: OTHER_BOARD }), NO_ORIGIN, OTHER_BOARD)
    expect(reconcile(snap, foreign)).toBe(snap)
  })

  it('ignores an event whose record.board_id disagrees with its envelope', () => {
    // The envelope's boardId is assigned by the adapter; record.board_id is what the
    // database stored. A disagreement means something upstream normalised it wrongly,
    // and guessing which one is right would silently plant a foreign card.
    const snap = board({ cards: [card('c1')] })
    const mismatched = cardChange('INSERT', card('x1', { board_id: OTHER_BOARD }))
    expect(reconcile(snap, mismatched)).toBe(snap)
  })

  it('ignores a DELETE for another board even though the id exists here', () => {
    const snap = board({ cards: [card('c1')] })
    expect(reconcile(snap, cardDelete('c1', NO_ORIGIN, OTHER_BOARD))).toBe(snap)
    expect(snap.cards['c1']).toBeDefined()
  })
})

describe('reconcile — archive vs delete', () => {
  it('keeps an archived row in the map, because an archive is an UPDATE', () => {
    // Soft delete is a concurrency decision: a hard DELETE bypasses RLS and ships
    // only the primary key, so it tells a subscriber nothing. project() does the hiding.
    const snap = board({ cards: [card('c1', { rev: 2 })] })
    const next = reconcile(
      snap,
      cardChange('UPDATE', card('c1', { rev: 3, archived_at: '2026-02-01T00:00:00Z' })),
    )
    expect(next.cards['c1']).toBeDefined()
    expect(next.cards['c1']!.archived_at).toBe('2026-02-01T00:00:00Z')
  })

  it('removes the row on a DELETE, reading nothing off old_record but the id', () => {
    // Reachable only via the optional postgres_changes transport. `record` is null
    // there, so the narrowing is what keeps this branch honest; and old_record holds
    // ONLY the primary key under RLS, which is why the type forbids reading more.
    const snap = board({ cards: [card('c1'), card('c2')] })
    const next = reconcile(snap, cardDelete('c1'))
    expect(next.cards['c1']).toBeUndefined()
    expect(next.cards['c2']).toBe(snap.cards['c2'])
  })

  it('returns the same reference for a DELETE of a row we do not hold', () => {
    const snap = board({ cards: [card('c1')] })
    expect(reconcile(snap, cardDelete('gone'))).toBe(snap)
  })
})

describe('reconcile — immutability and reference identity', () => {
  it('never mutates the snapshot or the maps it was given', () => {
    const snap = board({ cards: [card('c1', { rev: 1 })] })
    Object.freeze(snap)
    Object.freeze(snap.cards)
    Object.freeze(snap.columns)
    Object.freeze(snap.members)

    const next = reconcile(snap, cardChange('UPDATE', card('c1', { rev: 2, title: 'Moved' })))
    expect(next.cards['c1']!.title).toBe('Moved')
    expect(snap.cards['c1']!.title).toBe('c1')
    expect(Object.keys(snap.cards)).toEqual(['c1'])
  })

  it('leaves the untouched slices at the same reference, so only one slice re-projects', () => {
    const snap = board({
      cards: [card('c1')],
      columns: [column('col-todo')],
      members: [member('u1')],
    })
    const next = reconcile(snap, cardChange('UPDATE', card('c1', { rev: 2 })))
    expect(next.columns).toBe(snap.columns)
    expect(next.members).toBe(snap.members)
    expect(next.cards).not.toBe(snap.cards)
  })

  it('carries the board title and fetchedAt forward untouched', () => {
    // reconcile only ever advances rows. A board rename is not in the event stream
    // at all — there is no `boards` variant of ChangeEvent — so it arrives by refetch.
    const snap = board({ cards: [card('c1')] }, 7777)
    const next = reconcile(snap, cardChange('UPDATE', card('c1', { rev: 2 })))
    expect(next.title).toBe('Sprint 12')
    expect(next.fetchedAt).toBe(7777)
    expect(next.boardId).toBe(BOARD)
  })
})

describe('reconcile — columns and members', () => {
  it('gates columns by rev independently of cards', () => {
    const snap = board({ columns: [column('col-todo', { rev: 4, title: 'To do' })] })
    expect(reconcile(snap, columnChange('UPDATE', column('col-todo', { rev: 4, title: 'Nope' })))).toBe(snap)

    const next = reconcile(snap, columnChange('UPDATE', column('col-todo', { rev: 5, title: 'Doing' })))
    expect(next.columns['col-todo']!.title).toBe('Doing')
    expect(next.cards).toBe(snap.cards)
  })

  it('adds a collaborator on a board_members INSERT', () => {
    const snap = board({ members: [member('u1')] })
    const next = reconcile(snap, memberChange('INSERT', member('u2', { role: 'viewer' })))
    expect(Object.keys(next.members).sort()).toEqual(['u1', 'u2'])
    expect(next.members['u2']!.role).toBe('viewer')
  })

  it('applies a role change to an existing member', () => {
    const snap = board({ members: [member('u1', { role: 'viewer' })] })
    const next = reconcile(snap, memberChange('UPDATE', member('u1', { role: 'editor' })))
    expect(next.members['u1']!.role).toBe('editor')
  })

  it('returns the same reference for a replayed members event, which has no rev to gate on', () => {
    // board_members carries no `rev` column, so field equality is the only
    // monotonicity proxy available. It still has to hold the no-re-render contract.
    const snap = board({ members: [member('u1')] })
    expect(reconcile(snap, memberChange('UPDATE', member('u1')))).toBe(snap)
  })

  it('removes a member on a DELETE keyed the same way the map is', () => {
    const snap = board({ members: [member('u1'), member('u2')] })
    const next = reconcile(snap, {
      table: 'board_members',
      boardId: BOARD,
      operation: 'DELETE',
      record: null,
      old_record: { id: 'u1' },
      ...NO_ORIGIN,
    })
    expect(next.members['u1']).toBeUndefined()
    expect(next.members['u2']).toBeDefined()
  })
})

describe('ackedCommands', () => {
  it('returns the command id for a row my own client wrote', () => {
    expect(ackedCommands(cardChange('UPDATE', card('c1', { rev: 2 }), mine('cmd-1')), ME)).toEqual(['cmd-1'])
  })

  it('returns nothing when another client forges a command id from my queue', () => {
    // THE FORGED-ACK CASE. origin_cmd_id is client-minted and written into a row its
    // author controls, so Bob can put my pending command's id in his own write.
    // Honouring it would drop my optimistic value while my real write was still in
    // flight. Gating on origin_client_id bounds the damage to nothing.
    const forged = cardChange('UPDATE', card('c1', { rev: 2 }), {
      originClientId: BOB,
      originCmdId: 'cmd-1',
    })
    expect(ackedCommands(forged, ME)).toEqual([])
  })

  it('returns nothing when origin_cmd_id is null — an RPC or migration write', () => {
    const rpc = cardChange('INSERT', card('c1'), { originClientId: ME, originCmdId: null })
    expect(ackedCommands(rpc, ME)).toEqual([])
  })

  it('returns nothing when origin_client_id is null', () => {
    const anonymous = cardChange('UPDATE', card('c1', { rev: 2 }), {
      originClientId: null,
      originCmdId: 'cmd-1',
    })
    expect(ackedCommands(anonymous, ME)).toEqual([])
  })

  it('hands back one shared empty array, so the reducer can skip the queue by identity', () => {
    const a = ackedCommands(cardChange('UPDATE', card('c1', { rev: 2 })), ME)
    const b = ackedCommands(columnChange('INSERT', column('col-todo')), ME)
    expect(a).toBe(b)
    expect(a).toHaveLength(0)
  })

  it('acks from any table and any operation, including a DELETE', () => {
    expect(ackedCommands(columnChange('UPDATE', column('col-todo', { rev: 2 }), mine('cmd-c')), ME)).toEqual(['cmd-c'])
    expect(ackedCommands(memberChange('UPDATE', member('u1'), mine('cmd-m')), ME)).toEqual(['cmd-m'])
    expect(ackedCommands(cardDelete('c1', mine('cmd-d')), ME)).toEqual(['cmd-d'])
  })

  it('acks a stale echo that reconcile discards, because the two decisions are independent', () => {
    // t4 of the walkthrough: the commit result already stored rev 8, then my own echo
    // arrives at rev 8. The snapshot must not change — and the ack must still be
    // honoured, or an envelope whose write demonstrably landed would sit in the queue
    // forever waiting for an event that already came.
    const snap = board({ cards: [card('c1', { rev: 8, order_key: 'a1' })] })
    const echo = cardChange('UPDATE', card('c1', { rev: 8, order_key: 'a1' }), mine('m1'))
    expect(reconcile(snap, echo)).toBe(snap)
    expect(ackedCommands(echo, ME)).toEqual(['m1'])
  })

  it('does not ack when the event came from another tab of the same human', () => {
    // clientId is per tab, not per user: my other tab's write is somebody else's
    // write as far as my queue is concerned, and its command is not in my queue.
    const otherTab = cardChange('UPDATE', card('c1', { rev: 2 }), {
      originClientId: 'client-mine-tab-2',
      originCmdId: 'cmd-1',
    })
    expect(ackedCommands(otherTab, ME)).toEqual([])
  })
})
