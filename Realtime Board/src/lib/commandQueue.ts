/**
 * The command queue — the single source of truth for what this client has asked for
 * and the server has not yet confirmed.
 *
 * WHY A QUEUE OF INTENTS AND NOT AN OPTIMISTIC COPY OF THE BOARD
 * --------------------------------------------------------------
 * The usual optimistic-update design writes the predicted value straight into the
 * store and then defends it with an "is this event mine?" filter. That filter is
 * where the clobbering bugs live: a collaborator's unrelated edit to the same row
 * arrives, the filter cannot tell it from a stale echo of my own write, and one of
 * the two values is silently lost.
 *
 * Here the predicted value is NEVER written into the snapshot. It lives in this
 * queue as an intent, and `project()` re-applies the queue on top of the snapshot on
 * every render. Three properties fall out of that separation for free:
 *
 *   - A collaborator's echo can advance the snapshot underneath an in-flight command
 *     of mine without disturbing it. They get their field, I keep mine.
 *   - Rollback is removal from a list. There is no inverse operation to compute, so
 *     there is no inverse-operation bug, and no rollback copy to go stale or leak.
 *   - A reconnect can replace the whole snapshot and leave the queue untouched: an
 *     intent is re-applicable against any snapshot, where a diff is not.
 *
 * WHY ONE WRITE AT A TIME
 * -----------------------
 * `inflight` is a single slot, not a set. Causality is the reason: a `card.create`
 * must land before the `card.move` that depends on it, and FIFO with one write in
 * the air is the cheapest way to guarantee that without a dependency graph. If
 * throughput ever matters, keying `inflight` by target entity id is a contained
 * change — the `Queue` shape already allows it.
 *
 * PURITY
 * ------
 * Every event carries its own `at`, and `nack` carries a precomputed `backoffMs`.
 * Nothing in this file reads a clock or a random source. That is what makes the
 * retry schedule assertable to the millisecond with no fake timers, and it is
 * pinned by a test that makes `Date.now` throw.
 *
 * `ID` comes from '../types': `sync/adapter.ts` imports that name, it does not
 * re-export it.
 */

import type { CardPatch, Command, CommandStatus, Envelope, RejectionInfo, RejectionReason } from '../sync/adapter'
import type { ID, Priority } from '../types'

export interface Queue {
  /** FIFO by issue time. The authoritative order; `byId` is just the lookup. */
  readonly order: readonly ID[]
  readonly byId: Readonly<Record<ID, Envelope>>
  /** One write at a time, so causality holds. */
  readonly inflight: ID | null
}

export type QueueEvent =
  | { type: 'enqueue'; cmdId: ID; command: Command; actorId: ID; at: number }
  | { type: 'inflight'; cmdId: ID; at: number }
  | { type: 'ack'; cmdIds: readonly ID[] }
  | { type: 'nack'; cmdId: ID; rejection: RejectionInfo; retryable: boolean; at: number; backoffMs: number }
  /** User dismissed a terminal rejection. */
  | { type: 'retire'; cmdIds: readonly ID[] }
  /** Board switch / sign-out. */
  | { type: 'reset' }

/**
 * How many times one command may be SENT before a retryable failure becomes
 * terminal. `attempts` counts sends that have failed, so the fifth failure is the
 * one that gives up: at that point the socket has been unreachable across the whole
 * backoff schedule and telling the user beats retrying silently forever.
 */
export const MAX_ATTEMPTS = 5

/** Versioned, so a shape change is a clean discard rather than a misparse. */
export const QUEUE_STORAGE_KEY = 'realtime-board:queue:v1'

/**
 * One persisted queue per board. A command names cards and columns by id, and
 * only means something against the board it was issued on — replayed against
 * another board, a create lands in the wrong place and an edit reaches across
 * boards. With a single shared key, opening board B after a refresh on board A
 * would do exactly that.
 */
export function queueStorageKey(boardId: ID): string {
  return `${QUEUE_STORAGE_KEY}:${boardId}`
}

/**
 * Which stored queue a board starts from, given what is under its own key and
 * under the old bare key. Before queues were per board, the demo board's lived
 * under the bare key, so demo mode adopts that once — a returning visitor keeps
 * their pending and rejected edits. Live mode never adopts it: it could not
 * open a board at all before per-board keys, so nothing there is its.
 */
export function storedQueueFor(
  perBoard: string | null,
  legacy: string | null,
  mode: 'local' | 'supabase',
): string | null {
  if (perBoard !== null) return perBoard
  return mode === 'local' ? legacy : null
}
const STORAGE_VERSION = 1

/**
 * Shared so `pendingFor` can be called once per card per projection without
 * allocating an array for the overwhelmingly common "nothing pending" answer.
 */
const NO_ENVELOPES: readonly Envelope[] = Object.freeze([])

export function emptyQueue(): Queue {
  return { order: [], byId: {}, inflight: null }
}

/** A queue with nothing to drain and nothing to report. */
function isEmpty(queue: Queue): boolean {
  return queue.order.length === 0 && queue.inflight === null
}

export function queueReducer(queue: Queue, event: QueueEvent): Queue {
  switch (event.type) {
    case 'enqueue': {
      // Command ids are client-minted and unique, so the same id arriving twice means
      // one intent was dispatched twice (a double-invoked effect, a replayed action),
      // not that there are two intents. Re-adding it would either repeat the id in
      // `order` or rewrite an envelope that is already on the wire.
      if (lookup(queue, event.cmdId) !== undefined) return queue

      const envelope: Envelope = {
        id: event.cmdId,
        command: event.command,
        actorId: event.actorId,
        issuedAt: event.at,
        attempts: 0,
        // Due immediately: the first send carries no backoff.
        nextAttemptAt: event.at,
        status: 'pending',
      }

      // Supersede. Only PENDING envelopes may be dropped:
      //
      //   - an INFLIGHT one is already on the wire. Dropping its envelope would
      //     leave nothing for the commit result to ack, so the optimistic value
      //     would vanish from the projection while the write was still in flight,
      //     and a later echo would ack a command nobody is waiting for.
      //   - a REJECTED one is on screen with Retry and Dismiss. Retry is itself an
      //     enqueue, so superseding would make the error message disappear the
      //     moment the user tried again.
      const superseded = new Set<ID>()
      for (const id of queue.order) {
        const existing = lookup(queue, id)
        if (existing === undefined || existing.status !== 'pending') continue
        if (supersedes(event.command, existing.command)) superseded.add(id)
      }

      const byId: Record<ID, Envelope> = { ...queue.byId, [event.cmdId]: envelope }
      for (const id of superseded) delete byId[id]

      // Appended at the tail even when it replaced an earlier envelope: `order` is
      // FIFO by issue time, and this intent was issued last.
      const kept = superseded.size === 0 ? queue.order : queue.order.filter((id) => !superseded.has(id))
      return { order: [...kept, event.cmdId], byId, inflight: queue.inflight }
    }

    case 'inflight': {
      const existing = lookup(queue, event.cmdId)
      if (existing === undefined || existing.status !== 'pending') return queue
      // The slot is already taken, so the drain loop raced itself. Marking a second
      // envelope would strand the first as permanently 'inflight' with nothing
      // tracking it, and would break the one-write-at-a-time causality guarantee.
      if (queue.inflight !== null) return queue

      // While a write is in the air `nextAttemptAt` records when THIS attempt
      // started: it is the only timestamp the UI has for "how long has this been
      // trying", and it leaves the envelope immediately due if a reload demotes it
      // back to pending.
      const sending: Envelope = { ...existing, status: 'inflight', nextAttemptAt: event.at }
      return { order: queue.order, byId: { ...queue.byId, [event.cmdId]: sending }, inflight: event.cmdId }
    }

    case 'ack': {
      // BY COMMAND ID, never by row. Dropping the optimistic layer because *some*
      // event for that row arrived is the bug this design exists to avoid: the event
      // may be a collaborator's concurrent write, or an older echo, and my edit
      // would be silently discarded. An id this queue does not hold acks nothing, so
      // a forged origin_cmd_id from another client cannot touch it — and the same
      // guard makes the ack idempotent, which it has to be, because the commit result
      // and the realtime echo both carry it.
      const settled = new Set<ID>()
      for (const id of event.cmdIds) {
        if (lookup(queue, id) !== undefined) settled.add(id)
      }
      if (settled.size === 0) return queue

      const byId: Record<ID, Envelope> = { ...queue.byId }
      for (const id of settled) delete byId[id]
      return {
        order: queue.order.filter((id) => !settled.has(id)),
        byId,
        inflight: queue.inflight !== null && settled.has(queue.inflight) ? null : queue.inflight,
      }
    }

    case 'nack': {
      const existing = lookup(queue, event.cmdId)
      if (existing === undefined) return queue
      // Already terminal. A late failure for a command we have given up on must not
      // restart the retry budget.
      if (existing.status === 'rejected') return queue

      // A non-retryable reason burns no retry budget: 'denied', 'missing' and
      // 'invalid' describe a disagreement with the server that sending the identical
      // bytes again cannot resolve.
      const attempts = event.retryable ? existing.attempts + 1 : existing.attempts
      const terminal = !event.retryable || attempts >= MAX_ATTEMPTS

      const next: Envelope = {
        ...existing,
        attempts,
        status: terminal ? 'rejected' : 'pending',
        // `nextDue` never consults a terminal envelope's schedule, so leave the
        // attempt timestamp in place as a record of when the last try went out.
        nextAttemptAt: terminal ? existing.nextAttemptAt : event.at + event.backoffMs,
        rejection: event.rejection,
      }

      return {
        order: queue.order,
        byId: { ...queue.byId, [event.cmdId]: next },
        // Free the slot either way, or the drain loop wedges forever.
        inflight: queue.inflight === event.cmdId ? null : queue.inflight,
      }
    }

    case 'retire': {
      // Dismiss applies to terminal envelopes only. A pending or inflight one is
      // still the user's unsaved work: removing it would make the optimistic value
      // disappear from the board with the write possibly still on the wire.
      const dismissed = new Set<ID>()
      for (const id of event.cmdIds) {
        if (lookup(queue, id)?.status === 'rejected') dismissed.add(id)
      }
      if (dismissed.size === 0) return queue

      const byId: Record<ID, Envelope> = { ...queue.byId }
      for (const id of dismissed) delete byId[id]
      return { order: queue.order.filter((id) => !dismissed.has(id)), byId, inflight: queue.inflight }
    }

    case 'reset':
      // Same reference when there was nothing to clear, so React can bail out.
      return isEmpty(queue) ? queue : emptyQueue()
  }

  // Unreachable for the declared union, but the reducer is the last place in the
  // sync path that should throw: an unrecognised event leaves the queue alone.
  return queue
}

/**
 * The next envelope the drain loop may send, or null.
 *
 * Head-of-line blocking is deliberate. We stop at the first unconfirmed envelope
 * rather than scanning past it for one that happens to be due, because reordering
 * the queue would let a `card.move` land before the `card.create` it depends on.
 */
export function nextDue(queue: Queue, now: number): Envelope | null {
  // Something is already on the wire.
  if (queue.inflight !== null) return null

  for (const id of queue.order) {
    const envelope = lookup(queue, id)
    if (envelope === undefined) continue
    // Terminal envelopes are kept for the UI, not for the wire. They are the only
    // thing the drain loop may look past.
    if (envelope.status === 'rejected') continue
    if (envelope.status === 'inflight') return null
    return envelope.nextAttemptAt <= now ? envelope : null
  }
  return null
}

/** The five patch fields, listed so an untrusted blob cannot invent a sixth. */
const PATCH_FIELDS = ['title', 'description', 'assignee_id', 'priority', 'due_date'] as const

/** The keys a patch actually asserts. `null` is an assertion ("clear the assignee"); `undefined` is not. */
function assertedFields(patch: CardPatch): readonly (typeof PATCH_FIELDS)[number][] {
  return PATCH_FIELDS.filter((field) => patch[field] !== undefined)
}

/**
 * Whether `incoming` makes `existing` redundant — same kind, same target.
 *
 * This is legal ONLY because every command names ABSOLUTE target state. Three drags
 * of one card produce three commands each carrying the final `orderKey`, so sending
 * the last one alone reaches the same row state as sending all three. Were commands
 * deltas, coalescing `{ delta: +1 }` three times into one would be a corruption
 * rather than an optimisation.
 */
export function supersedes(incoming: Command, existing: Command): boolean {
  if (incoming.kind !== existing.kind) return false
  if (targetOf(incoming) !== targetOf(existing)) return false

  // `card.edit` is the one kind whose payload is only PARTIALLY absolute: a patch
  // names absolute values for the fields it mentions and says nothing about the
  // rest. So a pending `{ due_date }` may swallow a pending `{ title }` only if it
  // also carries a title — otherwise the title edit would be dropped from the queue
  // AND from the projection, which is exactly the silent data loss this queue exists
  // to prevent. When it cannot swallow it, both envelopes survive and `project()`
  // merges them field by field in FIFO order.
  if (incoming.kind === 'card.edit' && existing.kind === 'card.edit') {
    return assertedFields(existing.patch).every((field) => incoming.patch[field] !== undefined)
  }

  return true
}

/**
 * The entity a command is about. `card.create` names both a card and a column; the
 * card is its target, because that is the row the command writes.
 */
export function targetOf(command: Command): ID {
  switch (command.kind) {
    case 'card.create':
    case 'card.move':
    case 'card.edit':
    case 'card.archive':
      return command.cardId
    case 'column.create':
    case 'column.move':
    case 'column.rename':
    case 'column.archive':
      return command.columnId
  }
}

/**
 * The unconfirmed envelopes for one entity, in FIFO order — what `project()` replays
 * on top of the snapshot.
 *
 * Terminal envelopes are excluded, and that exclusion IS the rollback: a rejected
 * command stops being returned here, so the next projection equals the snapshot
 * exactly, with no inverse operation applied anywhere.
 */
export function pendingFor(queue: Queue, entityId: ID): readonly Envelope[] {
  let found: Envelope[] | null = null
  for (const id of queue.order) {
    const envelope = lookup(queue, id)
    if (envelope === undefined || envelope.status === 'rejected') continue
    if (targetOf(envelope.command) !== entityId) continue
    if (found === null) found = []
    found.push(envelope)
  }
  return found ?? NO_ENVELOPES
}

/** Terminal failures, in FIFO order — what the pending tray offers Retry / Dismiss on. */
export function rejectedOf(queue: Queue): readonly Envelope[] {
  let found: Envelope[] | null = null
  for (const id of queue.order) {
    const envelope = lookup(queue, id)
    if (envelope === undefined || envelope.status !== 'rejected') continue
    if (found === null) found = []
    found.push(envelope)
  }
  return found ?? NO_ENVELOPES
}

/**
 * Whether anything is still on its way to the server. Drives the status pill and the
 * `beforeunload` guard, so a terminal rejection must NOT count: it is a failure
 * already reported and no longer at risk of being lost by closing the tab.
 */
export function isDirty(queue: Queue): boolean {
  for (const id of queue.order) {
    const envelope = lookup(queue, id)
    if (envelope !== undefined && envelope.status !== 'rejected') return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

/**
 * Neither `order` nor `inflight` is stored. The array IS the FIFO order, and nothing
 * is in flight in a process that has just started.
 */
export function serializeQueue(queue: Queue): string {
  const envelopes: Envelope[] = []
  for (const id of queue.order) {
    const envelope = lookup(queue, id)
    if (envelope !== undefined) envelopes.push(envelope)
  }
  return JSON.stringify({ v: STORAGE_VERSION, envelopes })
}

/**
 * Rebuild a queue from localStorage.
 *
 * The input is UNTRUSTED. localStorage can hold another app's data, a blob a future
 * build wrote, or a string truncated halfway through a write, so every field is
 * checked and every command is REBUILT from validated parts rather than spread —
 * which also means no extra key from the blob can ride along into the adapter's
 * UPDATE statement. It never throws: failing to parse a convenience cache must not
 * stop the board from loading, since the snapshot is the truth and the queue is
 * only what we had not sent yet.
 *
 * Inflight is demoted to pending. After a reload we cannot know whether that write
 * landed, and we do not need to: commands are absolute and row ids are client-minted,
 * so a re-sent create is an upsert on the primary key and a re-sent move is a no-op.
 */
export function deserializeQueue(raw: string | null): Queue {
  if (raw === null || raw === '') return emptyQueue()

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return emptyQueue()
  }

  if (!isRecord(parsed)) return emptyQueue()
  // An unrecognised version is someone else's data or a shape we cannot know.
  // Starting clean beats guessing at it.
  if (parsed['v'] !== STORAGE_VERSION) return emptyQueue()
  const stored: unknown = parsed['envelopes']
  if (!Array.isArray(stored)) return emptyQueue()

  const order: ID[] = []
  const byId: Record<ID, Envelope> = {}
  for (const entry of stored) {
    const envelope = parseEnvelope(entry)
    // One corrupt entry drops itself rather than the whole queue — the others are
    // somebody's unsent work. A repeated id keeps the first: `byId` holds one
    // envelope per id, and `order` must never list one twice.
    if (envelope === null || byId[envelope.id] !== undefined) continue
    order.push(envelope.id)
    byId[envelope.id] = envelope
  }
  return { order, byId, inflight: null }
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/** Typed as possibly-absent on purpose: `order` and `byId` can disagree in a hand-edited blob. */
function lookup(queue: Queue, id: ID): Envelope | undefined {
  const envelope: Envelope | undefined = queue.byId[id]
  return envelope
}

const STATUSES: readonly CommandStatus[] = ['pending', 'inflight', 'rejected']
const REASONS: readonly RejectionReason[] = ['denied', 'missing', 'invalid', 'unavailable']
const PRIORITIES: readonly Priority[] = ['urgent', 'high', 'medium', 'low']

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Ids and order keys are never meaningfully empty, so '' is corruption. */
function asId(value: unknown): ID | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/** Titles and descriptions may legitimately be empty, unlike ids. */
function asText(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNullableText(value: unknown): string | null | undefined {
  if (value === null) return null
  return typeof value === 'string' ? value : undefined
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function oneOf<T extends string>(allowed: readonly T[], value: unknown): T | null {
  if (typeof value !== 'string') return null
  return (allowed as readonly string[]).includes(value) ? (value as T) : null
}

function parseRejection(value: unknown): RejectionInfo | null {
  if (!isRecord(value)) return null
  const reason = oneOf(REASONS, value['reason'])
  const message = asText(value['message'])
  if (reason === null || message === null) return null
  return { reason, message }
}

/**
 * Order keys are checked for being a non-empty string and no further. Deliberately:
 * `fracIndex.keyBetween` can EMIT a key its own `validateKey` rejects (the minimum
 * key — `fracIndex.test.ts` pins that asymmetry), and a future change to the digit
 * alphabet would widen the set of legal keys again. Running the validator here would
 * silently eat a legitimate queued move; a genuinely malformed key comes back from
 * the server as a terminal 'invalid' rejection, which is where it belongs.
 */
function parseCommand(value: unknown): Command | null {
  if (!isRecord(value)) return null

  switch (value['kind']) {
    case 'card.create': {
      const cardId = asId(value['cardId'])
      const columnId = asId(value['columnId'])
      const title = asText(value['title'])
      const orderKey = asId(value['orderKey'])
      if (cardId === null || columnId === null || title === null || orderKey === null) return null
      return { kind: 'card.create', cardId, columnId, title, orderKey }
    }
    case 'card.move': {
      const cardId = asId(value['cardId'])
      const toColumnId = asId(value['toColumnId'])
      const orderKey = asId(value['orderKey'])
      if (cardId === null || toColumnId === null || orderKey === null) return null
      return { kind: 'card.move', cardId, toColumnId, orderKey }
    }
    case 'card.edit': {
      const cardId = asId(value['cardId'])
      const patch = parsePatch(value['patch'])
      if (cardId === null || patch === null) return null
      return { kind: 'card.edit', cardId, patch }
    }
    case 'card.archive': {
      const cardId = asId(value['cardId'])
      if (cardId === null) return null
      return { kind: 'card.archive', cardId }
    }
    case 'column.create': {
      const columnId = asId(value['columnId'])
      const title = asText(value['title'])
      const orderKey = asId(value['orderKey'])
      if (columnId === null || title === null || orderKey === null) return null
      return { kind: 'column.create', columnId, title, orderKey }
    }
    case 'column.move': {
      const columnId = asId(value['columnId'])
      const orderKey = asId(value['orderKey'])
      if (columnId === null || orderKey === null) return null
      return { kind: 'column.move', columnId, orderKey }
    }
    case 'column.rename': {
      const columnId = asId(value['columnId'])
      const title = asText(value['title'])
      if (columnId === null || title === null) return null
      return { kind: 'column.rename', columnId, title }
    }
    case 'column.archive': {
      const columnId = asId(value['columnId'])
      if (columnId === null) return null
      return { kind: 'column.archive', columnId }
    }
    default:
      return null
  }
}

/**
 * A patch is rebuilt field by field. A known field present with the wrong type fails
 * the whole envelope rather than being dropped: dropping it would quietly change what
 * the user asked for, and a write that asserts less than the user intended is worse
 * than one we never send. A patch that asserts nothing is not a write at all.
 */
function parsePatch(value: unknown): CardPatch | null {
  if (!isRecord(value)) return null

  const patch: CardPatch = {}
  let asserted = 0

  for (const field of PATCH_FIELDS) {
    const raw: unknown = value[field]
    if (raw === undefined) continue
    asserted++

    switch (field) {
      case 'title':
      case 'description': {
        const text = asText(raw)
        if (text === null) return null
        patch[field] = text
        break
      }
      case 'assignee_id':
      case 'due_date': {
        const text = asNullableText(raw)
        if (text === undefined) return null
        patch[field] = text
        break
      }
      case 'priority': {
        const priority = oneOf(PRIORITIES, raw)
        if (priority === null) return null
        patch.priority = priority
        break
      }
    }
  }

  return asserted === 0 ? null : patch
}

function parseEnvelope(value: unknown): Envelope | null {
  if (!isRecord(value)) return null

  const id = asId(value['id'])
  const actorId = asId(value['actorId'])
  const issuedAt = asFiniteNumber(value['issuedAt'])
  const nextAttemptAt = asFiniteNumber(value['nextAttemptAt'])
  const attempts = asFiniteNumber(value['attempts'])
  const status = oneOf(STATUSES, value['status'])
  const command = parseCommand(value['command'])

  if (id === null || actorId === null || command === null || status === null) return null
  if (issuedAt === null || nextAttemptAt === null) return null
  // A fractional or negative attempt count was not written by this module.
  if (attempts === null || !Number.isInteger(attempts) || attempts < 0) return null

  const restored: Envelope = {
    id,
    command,
    actorId,
    issuedAt,
    attempts,
    nextAttemptAt,
    status: status === 'inflight' ? 'pending' : status,
  }

  const rejection = parseRejection(value['rejection'])
  return rejection === null ? restored : { ...restored, rejection }
}
