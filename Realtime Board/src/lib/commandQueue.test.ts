import { describe, expect, it } from 'vitest'
import {
  MAX_ATTEMPTS,
  QUEUE_STORAGE_KEY,
  deserializeQueue,
  emptyQueue,
  isDirty,
  nextDue,
  pendingFor,
  queueReducer,
  rejectedOf,
  serializeQueue,
  supersedes,
  targetOf,
} from './commandQueue'
import type { Queue, QueueEvent } from './commandQueue'
import type { CardPatch, Command, RejectionInfo } from '../sync/adapter'
import type { ID } from '../types'

const ACTOR = 'user-alice'

const UNAVAILABLE: RejectionInfo = { reason: 'unavailable', message: 'socket down' }
const DENIED: RejectionInfo = { reason: 'denied', message: 'you have view-only access' }

function move(cardId: ID, toColumnId: ID, orderKey: string): Command {
  return { kind: 'card.move', cardId, toColumnId, orderKey }
}

function edit(cardId: ID, patch: CardPatch): Command {
  return { kind: 'card.edit', cardId, patch }
}

function apply(queue: Queue, ...events: readonly QueueEvent[]): Queue {
  return events.reduce(queueReducer, queue)
}

function enqueue(queue: Queue, cmdId: ID, command: Command, at = 0): Queue {
  return queueReducer(queue, { type: 'enqueue', cmdId, command, actorId: ACTOR, at })
}

function send(queue: Queue, cmdId: ID, at = 0): Queue {
  return queueReducer(queue, { type: 'inflight', cmdId, at })
}

function fail(
  queue: Queue,
  cmdId: ID,
  rejection: RejectionInfo,
  retryable: boolean,
  at = 0,
  backoffMs = 1000,
): Queue {
  return queueReducer(queue, { type: 'nack', cmdId, rejection, retryable, at, backoffMs })
}

function statusOf(queue: Queue, cmdId: ID): string | undefined {
  return queue.byId[cmdId]?.status
}

/**
 * The two halves of the queue must never disagree: `order` is the FIFO truth and
 * `byId` is only its index, so a drift between them would silently lose a write or
 * replay one twice.
 */
function expectConsistent(queue: Queue): void {
  expect(new Set(queue.order).size, 'no id appears twice in order').toBe(queue.order.length)
  expect([...queue.order].sort()).toEqual(Object.keys(queue.byId).sort())
  if (queue.inflight !== null) {
    expect(queue.byId[queue.inflight]?.status).toBe('inflight')
  }
  const inflightCount = queue.order.filter((id) => queue.byId[id]?.status === 'inflight').length
  expect(inflightCount, 'at most one write on the wire').toBeLessThanOrEqual(1)
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const inner of Object.values(value as Record<string, unknown>)) deepFreeze(inner)
    Object.freeze(value)
  }
  return value
}

describe('emptyQueue', () => {
  it('starts with nothing queued and nothing on the wire', () => {
    const queue = emptyQueue()
    expect(queue.order).toEqual([])
    expect(queue.byId).toEqual({})
    expect(queue.inflight).toBeNull()
    expect(isDirty(queue)).toBe(false)
    expectConsistent(queue)
  })
})

describe('enqueue and ack — the happy path', () => {
  it('drops the envelope on ack, leaving order and byId consistent', () => {
    const queued = enqueue(emptyQueue(), 'c1', move('card-1', 'col-2', 'a1'), 100)
    expect(queued.order).toEqual(['c1'])
    expect(queued.byId['c1']?.status).toBe('pending')
    expect(queued.byId['c1']?.issuedAt).toBe(100)
    expect(queued.byId['c1']?.attempts).toBe(0)
    expectConsistent(queued)

    const acked = queueReducer(queued, { type: 'ack', cmdIds: ['c1'] })
    expect(acked.order).toEqual([])
    expect(acked.byId).toEqual({})
    expect(acked.inflight).toBeNull()
    expectConsistent(acked)
  })

  it('is due immediately when first queued, because the first send carries no backoff', () => {
    const queued = enqueue(emptyQueue(), 'c1', move('card-1', 'col-2', 'a1'), 100)
    expect(nextDue(queued, 100)?.id).toBe('c1')
  })

  it('acks the command that is in flight and frees the slot for the next one', () => {
    const queue = apply(
      emptyQueue(),
      { type: 'enqueue', cmdId: 'c1', command: move('card-1', 'col-2', 'a1'), actorId: ACTOR, at: 0 },
      { type: 'enqueue', cmdId: 'c2', command: move('card-2', 'col-2', 'a2'), actorId: ACTOR, at: 1 },
      { type: 'inflight', cmdId: 'c1', at: 2 },
    )
    expect(queue.inflight).toBe('c1')
    expect(nextDue(queue, 10)).toBeNull()

    const acked = queueReducer(queue, { type: 'ack', cmdIds: ['c1'] })
    expect(acked.inflight).toBeNull()
    expect(acked.order).toEqual(['c2'])
    expect(nextDue(acked, 10)?.id).toBe('c2')
    expectConsistent(acked)
  })

  it('preserves the FIFO order of the rest when a middle element is acked', () => {
    let queue = emptyQueue()
    queue = enqueue(queue, 'c1', move('card-1', 'col-1', 'a1'), 1)
    queue = enqueue(queue, 'c2', move('card-2', 'col-1', 'a2'), 2)
    queue = enqueue(queue, 'c3', move('card-3', 'col-1', 'a3'), 3)

    const acked = queueReducer(queue, { type: 'ack', cmdIds: ['c2'] })
    expect(acked.order).toEqual(['c1', 'c3'])
    expectConsistent(acked)
  })
})

describe('ack is by command id, not by row', () => {
  it('ignores an id the queue does not hold, so a forged origin_cmd_id cannot corrupt it', () => {
    // A collaborator can put any string in origin_cmd_id. If an unknown id settled
    // anything, their echo could drop MY unconfirmed edit — the exact failure this
    // ack-by-id rule exists to prevent.
    const queued = enqueue(emptyQueue(), 'mine', move('card-1', 'col-2', 'a1'))
    const after = queueReducer(queued, { type: 'ack', cmdIds: ['forged-by-bob'] })
    expect(after).toBe(queued)
  })

  it('settles exactly once when the same id arrives twice', () => {
    // The commit result acks it, then the realtime echo of the same write acks it
    // again milliseconds later. The second ack must be a no-op, not an error and not
    // a second removal that could take an unrelated envelope with it.
    const queued = enqueue(emptyQueue(), 'c1', move('card-1', 'col-2', 'a1'))
    const once = queueReducer(queued, { type: 'ack', cmdIds: ['c1'] })
    const twice = queueReducer(once, { type: 'ack', cmdIds: ['c1'] })
    expect(twice).toBe(once)
    expect(twice.order).toEqual([])
  })

  it('acks several ids in one pass and ignores the unknown ones among them', () => {
    let queue = emptyQueue()
    queue = enqueue(queue, 'c1', move('card-1', 'col-1', 'a1'))
    queue = enqueue(queue, 'c2', move('card-2', 'col-1', 'a2'))

    const after = queueReducer(queue, { type: 'ack', cmdIds: ['c2', 'never-existed'] })
    expect(after.order).toEqual(['c1'])
    expectConsistent(after)
  })

  it('acks a command that had already gone terminal, since the write evidently landed', () => {
    // A late echo carrying our own cmd id proves the server took the write after all.
    // Keeping the error on screen would be a lie.
    let queue = enqueue(emptyQueue(), 'c1', move('card-1', 'col-2', 'a1'))
    queue = send(queue, 'c1')
    queue = fail(queue, 'c1', DENIED, false)
    expect(statusOf(queue, 'c1')).toBe('rejected')

    const acked = queueReducer(queue, { type: 'ack', cmdIds: ['c1'] })
    expect(acked.order).toEqual([])
    expect(rejectedOf(acked)).toEqual([])
  })
})

describe('supersede', () => {
  it('coalesces a second PENDING move of the same card into one write', () => {
    // Three drags of one card are one intent as far as the server is concerned,
    // because each command names the ABSOLUTE destination.
    let queue = enqueue(emptyQueue(), 'm1', move('card-1', 'col-2', 'a1'), 10)
    queue = enqueue(queue, 'm2', move('card-1', 'col-3', 'a2'), 20)

    expect(queue.order).toEqual(['m2'])
    expect(queue.byId['m1']).toBeUndefined()
    expect(queue.byId['m2']?.command).toEqual(move('card-1', 'col-3', 'a2'))
    expect(queue.byId['m2']?.issuedAt).toBe(20)
    expectConsistent(queue)
  })

  it('appends rather than coalescing when the earlier command is already INFLIGHT', () => {
    // Superseding an in-flight command would mean acking a write that is still in
    // the air: nothing would be left for the commit result to settle, and the
    // optimistic value would vanish from the board mid-flight.
    let queue = enqueue(emptyQueue(), 'm1', move('card-1', 'col-2', 'a1'), 10)
    queue = send(queue, 'm1', 11)
    queue = enqueue(queue, 'm2', move('card-1', 'col-3', 'a2'), 20)

    expect(queue.order).toEqual(['m1', 'm2'])
    expect(statusOf(queue, 'm1')).toBe('inflight')
    expect(statusOf(queue, 'm2')).toBe('pending')
    expect(queue.inflight).toBe('m1')
    expectConsistent(queue)
  })

  it('leaves a REJECTED envelope alone, so Retry does not erase its own error message', () => {
    // Retry is an enqueue with a fresh cmd id. If it superseded the terminal
    // envelope, the tray entry would disappear the instant the user clicked Retry,
    // and a second failure would look like the first.
    let queue = enqueue(emptyQueue(), 'm1', move('card-1', 'col-2', 'a1'), 10)
    queue = send(queue, 'm1', 11)
    queue = fail(queue, 'm1', DENIED, false, 12)
    queue = enqueue(queue, 'm2', move('card-1', 'col-2', 'a1'), 20)

    expect(queue.order).toEqual(['m1', 'm2'])
    expect(statusOf(queue, 'm1')).toBe('rejected')
    expect(rejectedOf(queue).map((e) => e.id)).toEqual(['m1'])
  })

  it('puts the survivor at the tail, because order is FIFO by issue time', () => {
    let queue = emptyQueue()
    queue = enqueue(queue, 'm1', move('card-1', 'col-1', 'a1'), 1)
    queue = enqueue(queue, 'e1', edit('card-9', { title: 'unrelated' }), 2)
    queue = enqueue(queue, 'm2', move('card-1', 'col-1', 'a5'), 3)

    expect(queue.order).toEqual(['e1', 'm2'])
  })

  it('is false across kinds: a pending edit and a pending move of one card both survive', () => {
    const moveCmd = move('card-1', 'col-2', 'a1')
    const editCmd = edit('card-1', { title: 'Fix login' })
    expect(supersedes(moveCmd, editCmd)).toBe(false)
    expect(supersedes(editCmd, moveCmd)).toBe(false)

    let queue = enqueue(emptyQueue(), 'e1', editCmd, 1)
    queue = enqueue(queue, 'm1', moveCmd, 2)
    expect(queue.order).toEqual(['e1', 'm1'])
  })

  it('is false across targets: moves of two different cards never merge', () => {
    expect(supersedes(move('card-1', 'col-2', 'a1'), move('card-2', 'col-2', 'a1'))).toBe(false)

    let queue = enqueue(emptyQueue(), 'm1', move('card-1', 'col-2', 'a1'), 1)
    queue = enqueue(queue, 'm2', move('card-2', 'col-2', 'a2'), 2)
    expect(queue.order).toEqual(['m1', 'm2'])
  })

  it('merges repeated edits of the same field, which is what makes typing cheap', () => {
    expect(supersedes(edit('card-1', { title: 'ab' }), edit('card-1', { title: 'a' }))).toBe(true)

    let queue = enqueue(emptyQueue(), 'e1', edit('card-1', { title: 'a' }), 1)
    queue = enqueue(queue, 'e2', edit('card-1', { title: 'ab' }), 2)
    expect(queue.order).toEqual(['e2'])
  })

  it('REFUSES to swallow an edit whose fields the newer patch does not assert', () => {
    // A patch is absolute only for the fields it names. If { due_date } superseded
    // { title }, the title edit would be dropped from the queue AND from the
    // projection — silent data loss. Both survive, and project() merges them
    // field by field.
    const title = edit('card-1', { title: 'Fix login' })
    const due = edit('card-1', { due_date: '2026-01-01' })
    expect(supersedes(due, title)).toBe(false)
    expect(supersedes(title, due)).toBe(false)

    let queue = enqueue(emptyQueue(), 'e1', title, 1)
    queue = enqueue(queue, 'e2', due, 2)
    expect(queue.order).toEqual(['e1', 'e2'])
  })

  it('swallows an edit whose fields the newer patch fully covers', () => {
    const narrow = edit('card-1', { title: 'Fix login' })
    const wide = edit('card-1', { title: 'Fix login now', priority: 'urgent' })
    expect(supersedes(wide, narrow)).toBe(true)
    expect(supersedes(narrow, wide)).toBe(false)
  })

  it('treats a null patch value as an assertion, not an absence', () => {
    // 'clear the assignee' is a real instruction; 'say nothing about the assignee'
    // is not. Only `undefined` means the latter.
    const clear = edit('card-1', { assignee_id: null })
    const other = edit('card-1', { title: 'x' })
    expect(supersedes(other, clear)).toBe(false)
    expect(supersedes(edit('card-1', { assignee_id: 'bob' }), clear)).toBe(true)
  })

  it('coalesces the payload-free kinds, which are idempotent by construction', () => {
    expect(supersedes({ kind: 'card.archive', cardId: 'c' }, { kind: 'card.archive', cardId: 'c' })).toBe(true)
    expect(supersedes({ kind: 'column.archive', columnId: 'k' }, { kind: 'column.archive', columnId: 'k' })).toBe(true)
    expect(supersedes({ kind: 'column.rename', columnId: 'k', title: 'b' }, { kind: 'column.rename', columnId: 'k', title: 'a' })).toBe(true)
    expect(supersedes({ kind: 'column.move', columnId: 'k', orderKey: 'a2' }, { kind: 'column.move', columnId: 'k', orderKey: 'a1' })).toBe(true)
  })

  it('does not confuse a card target with a column target of the same string', () => {
    // card.create names both a card and a column; only the card is its target.
    expect(supersedes(
      { kind: 'card.create', cardId: 'x', columnId: 'shared', title: 'a', orderKey: 'a0' },
      { kind: 'card.create', cardId: 'y', columnId: 'shared', title: 'b', orderKey: 'a1' },
    )).toBe(false)
  })
})

describe('enqueue guards', () => {
  it('ignores a repeat of an id it already holds, because ids are client-minted and unique', () => {
    const queue = enqueue(emptyQueue(), 'c1', move('card-1', 'col-2', 'a1'), 10)
    const again = enqueue(queue, 'c1', move('card-1', 'col-3', 'a9'), 20)
    expect(again).toBe(queue)
    expect(again.order).toEqual(['c1'])
  })
})

describe('targetOf', () => {
  it('names the row each command writes', () => {
    expect(targetOf({ kind: 'card.create', cardId: 'c', columnId: 'k', title: 't', orderKey: 'a0' })).toBe('c')
    expect(targetOf(move('c', 'k', 'a0'))).toBe('c')
    expect(targetOf(edit('c', { title: 't' }))).toBe('c')
    expect(targetOf({ kind: 'card.archive', cardId: 'c' })).toBe('c')
    expect(targetOf({ kind: 'column.create', columnId: 'k', title: 't', orderKey: 'a0' })).toBe('k')
    expect(targetOf({ kind: 'column.move', columnId: 'k', orderKey: 'a0' })).toBe('k')
    expect(targetOf({ kind: 'column.rename', columnId: 'k', title: 't' })).toBe('k')
    expect(targetOf({ kind: 'column.archive', columnId: 'k' })).toBe('k')
  })
})

describe('inflight marking', () => {
  it('holds one write at a time, so a second mark is refused', () => {
    // Two writes in the air would break the causality that lets a card.create
    // precede the card.move depending on it, and would strand the first envelope
    // as permanently inflight with nothing tracking it.
    let queue = enqueue(emptyQueue(), 'c1', move('card-1', 'col-1', 'a1'), 1)
    queue = enqueue(queue, 'c2', move('card-2', 'col-1', 'a2'), 2)
    queue = send(queue, 'c1', 3)

    const raced = send(queue, 'c2', 4)
    expect(raced).toBe(queue)
    expect(raced.inflight).toBe('c1')
    expectConsistent(raced)
  })

  it('ignores an unknown id and an envelope that is not pending', () => {
    let queue = enqueue(emptyQueue(), 'c1', move('card-1', 'col-1', 'a1'), 1)
    expect(send(queue, 'nope', 2)).toBe(queue)

    queue = send(queue, 'c1', 2)
    queue = fail(queue, 'c1', DENIED, false, 3)
    expect(send(queue, 'c1', 4)).toBe(queue)
  })

  it('records when the attempt went out, so a demoted envelope is due again at once', () => {
    let queue = enqueue(emptyQueue(), 'c1', move('card-1', 'col-1', 'a1'), 1)
    queue = send(queue, 'c1', 5000)
    expect(queue.byId['c1']?.nextAttemptAt).toBe(5000)
    expect(queue.byId['c1']?.issuedAt).toBe(1)
  })
})

describe('nextDue', () => {
  it('returns null while anything is on the wire', () => {
    let queue = enqueue(emptyQueue(), 'c1', move('card-1', 'col-1', 'a1'), 1)
    queue = enqueue(queue, 'c2', move('card-2', 'col-1', 'a2'), 2)
    queue = send(queue, 'c1', 3)
    expect(nextDue(queue, 1_000_000)).toBeNull()
  })

  it('withholds the head until now passes its nextAttemptAt, then hands it over', () => {
    let queue = enqueue(emptyQueue(), 'c1', move('card-1', 'col-1', 'a1'), 0)
    queue = send(queue, 'c1', 0)
    queue = fail(queue, 'c1', UNAVAILABLE, true, 1000, 2000)
    expect(queue.byId['c1']?.nextAttemptAt).toBe(3000)

    expect(nextDue(queue, 2999)).toBeNull()
    expect(nextDue(queue, 3000)?.id).toBe('c1')
    expect(nextDue(queue, 9999)?.id).toBe('c1')
  })

  it('blocks on a not-yet-due head instead of reaching past it for a due one', () => {
    // Head-of-line blocking is the point: reordering would let a card.move land
    // before the card.create it depends on.
    let queue = enqueue(emptyQueue(), 'c1', { kind: 'card.create', cardId: 'card-1', columnId: 'col-1', title: 'New', orderKey: 'a1' }, 0)
    queue = enqueue(queue, 'c2', move('card-1', 'col-2', 'a2'), 0)
    queue = send(queue, 'c1', 0)
    queue = fail(queue, 'c1', UNAVAILABLE, true, 0, 5000)

    expect(nextDue(queue, 100)).toBeNull()
    expect(nextDue(queue, 5000)?.id).toBe('c1')
  })

  it('skips terminal envelopes and returns the pending one behind them', () => {
    let queue = enqueue(emptyQueue(), 'bad', move('card-1', 'col-1', 'a1'), 0)
    queue = enqueue(queue, 'good', move('card-2', 'col-1', 'a2'), 1)
    queue = send(queue, 'bad', 2)
    queue = fail(queue, 'bad', DENIED, false, 3)

    expect(statusOf(queue, 'bad')).toBe('rejected')
    expect(nextDue(queue, 10)?.id).toBe('good')
  })

  it('returns null for an empty queue and for a queue of nothing but failures', () => {
    expect(nextDue(emptyQueue(), 0)).toBeNull()

    let queue = enqueue(emptyQueue(), 'bad', move('card-1', 'col-1', 'a1'), 0)
    queue = send(queue, 'bad', 0)
    queue = fail(queue, 'bad', DENIED, false, 0)
    expect(nextDue(queue, 1_000_000)).toBeNull()
  })
})

describe('retry accounting', () => {
  it('returns a retryable failure to pending at exactly at + backoffMs', () => {
    // Both numbers are passed in, so the reducer never computes a schedule or
    // reads a clock — which is what makes this assertable to the millisecond.
    let queue = enqueue(emptyQueue(), 'c1', move('card-1', 'col-1', 'a1'), 0)
    queue = send(queue, 'c1', 500)
    queue = fail(queue, 'c1', UNAVAILABLE, true, 1500, 2000)

    const envelope = queue.byId['c1']
    expect(envelope?.status).toBe('pending')
    expect(envelope?.attempts).toBe(1)
    expect(envelope?.nextAttemptAt).toBe(3500)
    expect(envelope?.rejection).toEqual(UNAVAILABLE)
    expect(queue.inflight).toBeNull()
    expectConsistent(queue)
  })

  it('frees the inflight slot on failure, or the drain loop wedges forever', () => {
    let queue = enqueue(emptyQueue(), 'c1', move('card-1', 'col-1', 'a1'), 0)
    queue = send(queue, 'c1', 0)
    expect(queue.inflight).toBe('c1')
    queue = fail(queue, 'c1', UNAVAILABLE, true, 0, 0)
    expect(queue.inflight).toBeNull()
    expect(nextDue(queue, 0)?.id).toBe('c1')
  })

  it('goes terminal once MAX_ATTEMPTS sends have failed, and is never offered again', () => {
    let queue = enqueue(emptyQueue(), 'c1', move('card-1', 'col-1', 'a1'), 0)

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      queue = send(queue, 'c1', attempt * 100)
      queue = fail(queue, 'c1', UNAVAILABLE, true, attempt * 100, 0)
      const expected = attempt < MAX_ATTEMPTS ? 'pending' : 'rejected'
      expect(statusOf(queue, 'c1'), `after failure ${attempt}`).toBe(expected)
    }

    expect(queue.byId['c1']?.attempts).toBe(MAX_ATTEMPTS)
    expect(nextDue(queue, Number.MAX_SAFE_INTEGER)).toBeNull()
    expect(queue.inflight).toBeNull()
    expectConsistent(queue)
  })

  it('sends a command at most MAX_ATTEMPTS times', () => {
    let queue = enqueue(emptyQueue(), 'c1', move('card-1', 'col-1', 'a1'), 0)
    let sends = 0
    for (let tick = 0; tick < 50; tick++) {
      const due = nextDue(queue, tick)
      if (due === null) continue
      sends++
      queue = send(queue, due.id, tick)
      queue = fail(queue, due.id, UNAVAILABLE, true, tick, 0)
    }
    expect(sends).toBe(MAX_ATTEMPTS)
  })

  it('sends a terminal reason straight to rejected without burning retry budget', () => {
    // 'denied', 'missing' and 'invalid' describe a disagreement with the server that
    // re-sending the identical bytes cannot resolve, so spending four more attempts
    // on it only delays telling the user.
    for (const rejection of [DENIED, { reason: 'missing', message: 'gone' }, { reason: 'invalid', message: 'bad key' }] as const) {
      let queue = enqueue(emptyQueue(), 'c1', move('card-1', 'col-1', 'a1'), 0)
      queue = send(queue, 'c1', 0)
      queue = fail(queue, 'c1', rejection, false, 0, 1000)

      expect(statusOf(queue, 'c1')).toBe('rejected')
      expect(queue.byId['c1']?.attempts, 'no retry budget spent').toBe(0)
      expect(queue.byId['c1']?.rejection).toEqual(rejection)
    }
  })

  it('will not resurrect a terminal envelope with a late failure', () => {
    let queue = enqueue(emptyQueue(), 'c1', move('card-1', 'col-1', 'a1'), 0)
    queue = send(queue, 'c1', 0)
    queue = fail(queue, 'c1', DENIED, false, 0)
    const terminal = queue

    const late = fail(queue, 'c1', UNAVAILABLE, true, 50, 1000)
    expect(late).toBe(terminal)
    expect(statusOf(late, 'c1')).toBe('rejected')
  })

  it('ignores a failure for an id it does not hold', () => {
    const queue = enqueue(emptyQueue(), 'c1', move('card-1', 'col-1', 'a1'), 0)
    expect(fail(queue, 'other', UNAVAILABLE, true, 0, 1000)).toBe(queue)
  })
})

describe('terminal envelopes are retained, not deleted', () => {
  it('keeps the failure so the tray can offer Retry and Dismiss', () => {
    let queue = enqueue(emptyQueue(), 'c1', move('card-1', 'col-1', 'a1'), 0)
    queue = send(queue, 'c1', 0)
    queue = fail(queue, 'c1', DENIED, false, 0)

    expect(queue.order).toEqual(['c1'])
    expect(rejectedOf(queue).map((e) => e.rejection?.message)).toEqual(['you have view-only access'])
  })

  it('removes it on retire', () => {
    let queue = enqueue(emptyQueue(), 'c1', move('card-1', 'col-1', 'a1'), 0)
    queue = send(queue, 'c1', 0)
    queue = fail(queue, 'c1', DENIED, false, 0)

    const retired = queueReducer(queue, { type: 'retire', cmdIds: ['c1'] })
    expect(retired.order).toEqual([])
    expect(rejectedOf(retired)).toEqual([])
    expectConsistent(retired)
  })

  it('refuses to retire a pending or inflight envelope — that is unsaved work, not a dismissed error', () => {
    let queue = enqueue(emptyQueue(), 'pending', move('card-1', 'col-1', 'a1'), 0)
    queue = enqueue(queue, 'flying', move('card-2', 'col-1', 'a2'), 1)
    queue = send(queue, 'pending', 2)

    const after = queueReducer(queue, { type: 'retire', cmdIds: ['pending', 'flying', 'unknown'] })
    expect(after).toBe(queue)
    expect(after.order).toEqual(['pending', 'flying'])
  })

  it('retires several at once and leaves the live ones behind', () => {
    let queue = enqueue(emptyQueue(), 'bad1', move('card-1', 'col-1', 'a1'), 0)
    queue = send(queue, 'bad1', 0)
    queue = fail(queue, 'bad1', DENIED, false, 0)
    queue = enqueue(queue, 'bad2', move('card-2', 'col-1', 'a2'), 1)
    queue = send(queue, 'bad2', 1)
    queue = fail(queue, 'bad2', DENIED, false, 1)
    queue = enqueue(queue, 'live', move('card-3', 'col-1', 'a3'), 2)

    const after = queueReducer(queue, { type: 'retire', cmdIds: ['bad1', 'bad2'] })
    expect(after.order).toEqual(['live'])
    expectConsistent(after)
  })
})

describe('reset', () => {
  it('clears order, byId and inflight together', () => {
    let queue = enqueue(emptyQueue(), 'c1', move('card-1', 'col-1', 'a1'), 0)
    queue = enqueue(queue, 'c2', move('card-2', 'col-1', 'a2'), 1)
    queue = send(queue, 'c1', 2)

    const after = queueReducer(queue, { type: 'reset' })
    expect(after.order).toEqual([])
    expect(after.byId).toEqual({})
    expect(after.inflight).toBeNull()
    expect(isDirty(after)).toBe(false)
  })

  it('returns the same queue when there was nothing to clear, so React can bail out', () => {
    const queue = emptyQueue()
    expect(queueReducer(queue, { type: 'reset' })).toBe(queue)
  })
})

describe('isDirty', () => {
  it('is true for pending and for inflight work', () => {
    let queue = enqueue(emptyQueue(), 'c1', move('card-1', 'col-1', 'a1'), 0)
    expect(isDirty(queue)).toBe(true)
    queue = send(queue, 'c1', 0)
    expect(isDirty(queue)).toBe(true)
  })

  it('is false for a queue holding nothing but failures', () => {
    // It guards `beforeunload`. A terminal rejection is a failure already reported,
    // so warning the user that they would lose it on close would be noise.
    let queue = enqueue(emptyQueue(), 'c1', move('card-1', 'col-1', 'a1'), 0)
    queue = send(queue, 'c1', 0)
    queue = fail(queue, 'c1', DENIED, false, 0)
    expect(isDirty(queue)).toBe(false)
  })

  it('is false once everything is acked', () => {
    let queue = enqueue(emptyQueue(), 'c1', move('card-1', 'col-1', 'a1'), 0)
    queue = queueReducer(queue, { type: 'ack', cmdIds: ['c1'] })
    expect(isDirty(queue)).toBe(false)
  })
})

describe('pendingFor', () => {
  it('returns one entity’s unconfirmed commands in FIFO order, inflight included', () => {
    let queue = enqueue(emptyQueue(), 'e1', edit('card-1', { title: 'a' }), 0)
    queue = send(queue, 'e1', 0)
    queue = enqueue(queue, 'm1', move('card-1', 'col-2', 'a1'), 1)
    queue = enqueue(queue, 'other', move('card-9', 'col-2', 'a1'), 2)

    expect(pendingFor(queue, 'card-1').map((e) => e.id)).toEqual(['e1', 'm1'])
    expect(pendingFor(queue, 'card-9').map((e) => e.id)).toEqual(['other'])
  })

  it('omits terminal envelopes, which is how rollback happens with no inverse operation', () => {
    let queue = enqueue(emptyQueue(), 'm1', move('card-1', 'col-2', 'a1'), 0)
    queue = send(queue, 'm1', 0)
    expect(pendingFor(queue, 'card-1')).toHaveLength(1)

    queue = fail(queue, 'm1', DENIED, false, 0)
    // project() replays exactly this list, so the board is back to the snapshot.
    expect(pendingFor(queue, 'card-1')).toEqual([])
  })

  it('returns one shared empty array, so projecting a quiet board allocates nothing', () => {
    const queue = enqueue(emptyQueue(), 'm1', move('card-1', 'col-2', 'a1'), 0)
    expect(pendingFor(queue, 'card-2')).toBe(pendingFor(queue, 'card-3'))
    expect(pendingFor(emptyQueue(), 'card-1')).toEqual([])
  })

  it('matches a column command by its column id', () => {
    const queue = enqueue(emptyQueue(), 'r1', { kind: 'column.rename', columnId: 'col-1', title: 'Doing' }, 0)
    expect(pendingFor(queue, 'col-1').map((e) => e.id)).toEqual(['r1'])
  })
})

describe('rejectedOf', () => {
  it('lists failures in FIFO order and nothing else', () => {
    let queue = enqueue(emptyQueue(), 'bad1', move('card-1', 'col-1', 'a1'), 0)
    queue = send(queue, 'bad1', 0)
    queue = fail(queue, 'bad1', DENIED, false, 0)
    queue = enqueue(queue, 'live', move('card-2', 'col-1', 'a2'), 1)
    queue = enqueue(queue, 'bad2', move('card-3', 'col-1', 'a3'), 2)
    queue = send(queue, 'bad2', 3)
    queue = fail(queue, 'bad2', { reason: 'missing', message: 'column gone' }, false, 3)

    expect(rejectedOf(queue).map((e) => e.id)).toEqual(['bad1', 'bad2'])
    expect(rejectedOf(emptyQueue())).toEqual([])
  })
})

describe('persistence', () => {
  function populated(): Queue {
    let queue = enqueue(emptyQueue(), 'c1', { kind: 'card.create', cardId: 'card-1', columnId: 'col-1', title: 'New card', orderKey: 'a1' }, 10)
    queue = enqueue(queue, 'c2', edit('card-1', { title: 'Renamed', priority: 'urgent', assignee_id: null, due_date: '2026-02-01', description: '' }), 20)
    queue = enqueue(queue, 'c3', { kind: 'column.rename', columnId: 'col-1', title: 'Doing' }, 30)
    queue = send(queue, 'c3', 31)
    queue = fail(queue, 'c3', UNAVAILABLE, true, 31, 1000)
    return queue
  }

  it('has a versioned key, so a shape change is a clean discard rather than a misparse', () => {
    expect(QUEUE_STORAGE_KEY).toBe('realtime-board:queue:v1')
  })

  it('round-trips a queue that has nothing in flight', () => {
    const queue = populated()
    expect(queue.inflight).toBeNull()
    expect(deserializeQueue(serializeQueue(queue))).toEqual(queue)
  })

  it('demotes inflight to pending on load', () => {
    // After a reload we cannot know whether that write landed, and we do not need
    // to: the command is absolute and the row id was minted here, so a re-sent
    // create is an upsert and a re-sent move is a no-op.
    let queue = enqueue(emptyQueue(), 'c1', move('card-1', 'col-2', 'a1'), 10)
    queue = send(queue, 'c1', 20)
    expect(queue.inflight).toBe('c1')

    const loaded = deserializeQueue(serializeQueue(queue))
    expect(loaded.inflight).toBeNull()
    expect(statusOf(loaded, 'c1')).toBe('pending')
    // Immediately due, because the attempt timestamp it carries is in the past.
    expect(nextDue(loaded, 20)?.id).toBe('c1')
    expectConsistent(loaded)
  })

  it('keeps a terminal failure across a reload, so the tray still has something to show', () => {
    let queue = enqueue(emptyQueue(), 'c1', move('card-1', 'col-2', 'a1'), 10)
    queue = send(queue, 'c1', 10)
    queue = fail(queue, 'c1', DENIED, false, 10)

    const loaded = deserializeQueue(serializeQueue(queue))
    expect(rejectedOf(loaded).map((e) => e.rejection)).toEqual([DENIED])
  })

  it('preserves FIFO order through a round trip', () => {
    let queue = emptyQueue()
    for (let i = 0; i < 6; i++) queue = enqueue(queue, `c${i}`, move(`card-${i}`, 'col-1', `a${i}`), i)
    expect(deserializeQueue(serializeQueue(queue)).order).toEqual(queue.order)
  })

  it('serializes an empty queue to something that loads back empty', () => {
    expect(deserializeQueue(serializeQueue(emptyQueue()))).toEqual(emptyQueue())
  })
})

describe('deserializeQueue never throws on untrusted input', () => {
  it.each([
    ['nothing stored', null],
    ['an empty string', ''],
    ['a half-written string', '{"v":1,"envelopes":[{"id":"c1","comm'],
    ['plain garbage', 'garbage'],
    ['a bare number', '42'],
    ['a bare string', '"hello"'],
    ['null', 'null'],
    ['a top-level array', '[1,2,3]'],
    ['another app’s object', '{"theme":"dark","recent":["a"]}'],
    ['our key with a future version', '{"v":2,"envelopes":[]}'],
    ['our key with no version', '{"envelopes":[]}'],
    ['a version that is a string', '{"v":"1","envelopes":[]}'],
    ['envelopes that are not an array', '{"v":1,"envelopes":{"c1":{}}}'],
    ['envelopes that are null', '{"v":1,"envelopes":null}'],
  ])('returns an empty queue for %s', (_label, raw) => {
    expect(deserializeQueue(raw)).toEqual(emptyQueue())
  })

  it('drops one corrupt entry rather than the whole queue', () => {
    // The other envelopes are somebody's unsent work. Throwing them away because a
    // neighbour is malformed would turn one bad byte into lost edits.
    const good = enqueue(emptyQueue(), 'good', move('card-1', 'col-2', 'a1'), 10)
    const stored = JSON.parse(serializeQueue(good)) as { v: number; envelopes: unknown[] }
    stored.envelopes.unshift({ id: 'bad', command: { kind: 'card.move' } }, null, 7, 'nope', [])

    const loaded = deserializeQueue(JSON.stringify(stored))
    expect(loaded.order).toEqual(['good'])
    expectConsistent(loaded)
  })

  it.each([
    ['an unknown command kind', { kind: 'card.explode', cardId: 'card-1' }],
    ['a command that is not an object', 'card.move'],
    ['a move with no order key', { kind: 'card.move', cardId: 'card-1', toColumnId: 'col-1' }],
    ['a move with an empty id', { kind: 'card.move', cardId: '', toColumnId: 'col-1', orderKey: 'a1' }],
    ['a numeric id', { kind: 'card.move', cardId: 7, toColumnId: 'col-1', orderKey: 'a1' }],
    ['an edit with no patch', { kind: 'card.edit', cardId: 'card-1' }],
    ['an edit asserting nothing', { kind: 'card.edit', cardId: 'card-1', patch: {} }],
    ['an edit whose title is a number', { kind: 'card.edit', cardId: 'card-1', patch: { title: 3 } }],
    ['an edit with a priority outside the enum', { kind: 'card.edit', cardId: 'card-1', patch: { priority: 'BLOCKER' } }],
    ['an edit whose only field is unknown', { kind: 'card.edit', cardId: 'card-1', patch: { colour: 'red' } }],
  ])('drops an envelope carrying %s', (_label, command) => {
    const raw = JSON.stringify({
      v: 1,
      envelopes: [{ id: 'c1', command, actorId: ACTOR, issuedAt: 0, attempts: 0, nextAttemptAt: 0, status: 'pending' }],
    })
    expect(deserializeQueue(raw)).toEqual(emptyQueue())
  })

  it.each([
    ['a missing id', { id: undefined }],
    ['a missing actor', { actorId: undefined }],
    ['an unknown status', { status: 'queued' }],
    ['a NaN timestamp', { issuedAt: Number.NaN }],
    ['an infinite timestamp', { nextAttemptAt: Number.POSITIVE_INFINITY }],
    ['a timestamp that is a string', { issuedAt: '2026-01-01' }],
    ['a fractional attempt count', { attempts: 1.5 }],
    ['a negative attempt count', { attempts: -1 }],
  ])('drops an envelope with %s', (_label, override) => {
    const raw = JSON.stringify({
      v: 1,
      envelopes: [{
        id: 'c1',
        command: move('card-1', 'col-1', 'a1'),
        actorId: ACTOR,
        issuedAt: 0,
        attempts: 0,
        nextAttemptAt: 0,
        status: 'pending',
        ...override,
      }],
    })
    expect(deserializeQueue(raw)).toEqual(emptyQueue())
  })

  it('keeps the first of two envelopes sharing an id', () => {
    // byId can hold one envelope per id, and order must never list one twice.
    const envelope = {
      id: 'c1',
      command: move('card-1', 'col-1', 'a1'),
      actorId: ACTOR,
      issuedAt: 0,
      attempts: 0,
      nextAttemptAt: 0,
      status: 'pending',
    }
    const loaded = deserializeQueue(JSON.stringify({
      v: 1,
      envelopes: [envelope, { ...envelope, command: move('card-1', 'col-9', 'a9') }],
    }))

    expect(loaded.order).toEqual(['c1'])
    expect(loaded.byId['c1']?.command).toEqual(move('card-1', 'col-1', 'a1'))
    expectConsistent(loaded)
  })

  it('rebuilds commands field by field, so no extra key rides along into the UPDATE', () => {
    const raw = JSON.stringify({
      v: 1,
      envelopes: [{
        id: 'c1',
        command: { kind: 'card.move', cardId: 'card-1', toColumnId: 'col-1', orderKey: 'a1', board_id: 'someone-elses-board', rev: 999 },
        actorId: ACTOR,
        issuedAt: 0,
        attempts: 0,
        nextAttemptAt: 0,
        status: 'pending',
        surprise: true,
      }],
    })
    const loaded = deserializeQueue(raw)
    expect(loaded.byId['c1']?.command).toEqual(move('card-1', 'col-1', 'a1'))
    expect(Object.keys(loaded.byId['c1'] ?? {}).sort()).toEqual(
      ['actorId', 'attempts', 'command', 'id', 'issuedAt', 'nextAttemptAt', 'status'],
    )
  })

  it('drops a malformed rejection instead of the envelope that carries it', () => {
    const raw = JSON.stringify({
      v: 1,
      envelopes: [{
        id: 'c1',
        command: move('card-1', 'col-1', 'a1'),
        actorId: ACTOR,
        issuedAt: 0,
        attempts: 0,
        nextAttemptAt: 0,
        status: 'pending',
        rejection: { reason: 'teapot', message: 418 },
      }],
    })
    const loaded = deserializeQueue(raw)
    expect(loaded.order).toEqual(['c1'])
    expect(loaded.byId['c1']?.rejection).toBeUndefined()
  })

  it('does not validate the order key, because a legal key is not always an acceptable one', () => {
    // fracIndex.keyBetween can emit the minimum key, which its own validateKey
    // rejects (pinned in fracIndex.test.ts). Running that validator here would eat a
    // legitimate queued move; a genuinely malformed key comes back from the server
    // as a terminal 'invalid' rejection, which is where it belongs.
    const odd = 'A00000000000000000000000000'
    const queue = enqueue(emptyQueue(), 'c1', move('card-1', 'col-1', odd), 0)
    const loaded = deserializeQueue(serializeQueue(queue))
    expect(loaded.byId['c1']?.command).toEqual(move('card-1', 'col-1', odd))
  })
})

describe('purity and immutability', () => {
  it('never reads a clock or a random source: every event supplies its own time', () => {
    const realNow = Date.now
    const realRandom = Math.random
    Date.now = () => {
      throw new Error('commandQueue read the clock')
    }
    Math.random = () => {
      throw new Error('commandQueue read a random source')
    }

    try {
      let queue = emptyQueue()
      queue = enqueue(queue, 'c1', move('card-1', 'col-1', 'a1'), 1)
      queue = enqueue(queue, 'c2', edit('card-2', { title: 'x' }), 2)
      queue = send(queue, 'c1', 3)
      queue = fail(queue, 'c1', UNAVAILABLE, true, 4, 1000)
      queue = send(queue, 'c2', 5)
      queue = fail(queue, 'c2', DENIED, false, 6, 1000)
      queue = queueReducer(queue, { type: 'retire', cmdIds: ['c2'] })
      nextDue(queue, 2000)
      pendingFor(queue, 'card-1')
      rejectedOf(queue)
      isDirty(queue)
      queue = deserializeQueue(serializeQueue(queue))
      queue = queueReducer(queue, { type: 'ack', cmdIds: ['c1'] })
      expect(queue.order).toEqual([])
    } finally {
      Date.now = realNow
      Math.random = realRandom
    }
  })

  it('never mutates the queue it is given', () => {
    // Deep-frozen, so any in-place write would throw in a module's strict mode
    // rather than quietly producing a state object React cannot tell apart.
    let queue = emptyQueue()
    queue = enqueue(queue, 'c1', move('card-1', 'col-1', 'a1'), 1)
    queue = enqueue(queue, 'c2', move('card-2', 'col-1', 'a2'), 2)
    queue = send(queue, 'c1', 3)
    deepFreeze(queue)

    const events: readonly QueueEvent[] = [
      { type: 'enqueue', cmdId: 'c3', command: move('card-2', 'col-9', 'a9'), actorId: ACTOR, at: 4 },
      { type: 'inflight', cmdId: 'c2', at: 4 },
      { type: 'ack', cmdIds: ['c1'] },
      { type: 'nack', cmdId: 'c1', rejection: UNAVAILABLE, retryable: true, at: 4, backoffMs: 1000 },
      { type: 'nack', cmdId: 'c1', rejection: DENIED, retryable: false, at: 4, backoffMs: 0 },
      { type: 'retire', cmdIds: ['c1', 'c2'] },
      { type: 'reset' },
    ]

    for (const event of events) {
      expectConsistent(queueReducer(queue, event))
    }
    expect(queue.order).toEqual(['c1', 'c2'])
    expect(queue.inflight).toBe('c1')
  })

  it('returns the same queue for every no-op, so React can skip the re-render', () => {
    const queue = deepFreeze(enqueue(emptyQueue(), 'c1', move('card-1', 'col-1', 'a1'), 1))
    const noOps: readonly QueueEvent[] = [
      { type: 'enqueue', cmdId: 'c1', command: move('card-1', 'col-1', 'a1'), actorId: ACTOR, at: 2 },
      { type: 'inflight', cmdId: 'unknown', at: 2 },
      { type: 'ack', cmdIds: [] },
      { type: 'ack', cmdIds: ['unknown'] },
      { type: 'nack', cmdId: 'unknown', rejection: UNAVAILABLE, retryable: true, at: 2, backoffMs: 1 },
      { type: 'retire', cmdIds: ['c1'] },
    ]
    for (const event of noOps) {
      expect(queueReducer(queue, event), event.type).toBe(queue)
    }
  })
})

describe('the drain loop, end to end', () => {
  it('survives a reload mid-flight and finishes the write it could not confirm', () => {
    // The whole point of absolute commands with client-minted ids: we re-send
    // without knowing whether the first attempt landed, and either way the row ends
    // up in the state the command named.
    let queue = enqueue(emptyQueue(), 'm1', move('card-1', 'col-2', 'a1'), 100)
    queue = send(queue, 'm1', 110)

    const reloaded = deserializeQueue(serializeQueue(queue))
    const due = nextDue(reloaded, 200)
    expect(due?.id).toBe('m1')
    expect(due?.command).toEqual(move('card-1', 'col-2', 'a1'))

    const resent = send(reloaded, 'm1', 200)
    const settled = queueReducer(resent, { type: 'ack', cmdIds: ['m1'] })
    expect(isDirty(settled)).toBe(false)
    expectConsistent(settled)
  })

  it('drains a mixed queue in FIFO order, one write at a time', () => {
    let queue = emptyQueue()
    queue = enqueue(queue, 'c1', { kind: 'card.create', cardId: 'card-1', columnId: 'col-1', title: 'New', orderKey: 'a1' }, 0)
    queue = enqueue(queue, 'c2', edit('card-1', { title: 'New card' }), 1)
    queue = enqueue(queue, 'c3', move('card-1', 'col-2', 'a2'), 2)

    const sent: ID[] = []
    for (let tick = 0; tick < 20 && isDirty(queue); tick++) {
      const due = nextDue(queue, tick)
      if (due === null) continue
      sent.push(due.id)
      queue = send(queue, due.id, tick)
      expect(nextDue(queue, tick), 'nothing else may be sent while one is in flight').toBeNull()
      queue = queueReducer(queue, { type: 'ack', cmdIds: [due.id] })
    }

    expect(sent).toEqual(['c1', 'c2', 'c3'])
    expect(queue.order).toEqual([])
  })
})
