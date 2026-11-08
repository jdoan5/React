/**
 * Reconciliation — folding what the server says happened into the authoritative
 * snapshot.
 *
 * WHAT THIS MODULE OWNS, AND WHAT IT DELIBERATELY DOES NOT
 * --------------------------------------------------------
 * The snapshot is server truth and nothing else. Optimistic edits live in the
 * command queue and are re-applied on top at projection time, so nothing in here
 * ever has to ask "is this event my own?" — the question whose answer-shaped
 * filter is where the clobbering bugs live in designs that write optimistic
 * values straight into the store. There is no such filter here because there is
 * nothing of mine in the snapshot to protect.
 *
 * MONOTONICITY IS THE WHOLE POINT
 * -------------------------------
 * Realtime guarantees neither delivery nor ordering. Every reconnect is a hole in
 * the stream of unknown size, and the events either side of that hole can arrive
 * in any order — including an event we already folded in, or an old one behind a
 * newer one. `rev` is assigned by a database trigger and is monotonic per row
 * (the client cannot supply it), so an event at or below the rev we already hold
 * carries no information and is discarded.
 *
 * It is discarded by returning the SAME snapshot object. That is not a
 * micro-optimisation: it is what lets `useMemo(() => project(snapshot, queue))`
 * skip recomputation entirely, so a replayed echo costs nothing and — crucially —
 * cannot move the board backwards for a frame before the next event corrects it.
 * The same guard is why a `commit` result and its realtime echo cost one render
 * and not two: the echo arrives carrying the rev the commit already stored, and
 * dies right here.
 *
 * WHY `old_record` IS NEVER READ PAST THE PRIMARY KEY
 * --------------------------------------------------
 * With RLS enabled, `replica identity full` does not populate `old` beyond the
 * primary key, and there is no workaround. So the natural-looking
 * `old.column_id !== record.column_id` is a comparison against `undefined` and is
 * therefore always true — the classic version of this bug, and a hard one to see
 * because it fails in the safe direction (extra work) until something depends on
 * it. `RowChange` in sync/adapter.ts types `old_record` as `{ id }` so that
 * reading any other field is a compile error rather than a comment nobody reads.
 * Where we need a before-and-after, we diff against our own snapshot, which is
 * the only complete copy of the previous row that exists on this client.
 *
 * PURITY
 * ------
 * No React, no network, no DOM, and no clock: `fetchedAt` is passed in. A fold
 * over events that read the time would be untestable at the only interesting
 * moments, which are all about ordering.
 */

import type { BoardSnapshot, ChangeEvent } from '../sync/adapter'
import type { CardRow, ColumnRow, ID, MemberRow } from '../types'

/**
 * A row the server stamps with a monotonic revision. Cards and columns qualify;
 * `board_members` does not, which is why it takes a different path below.
 */
interface Versioned {
  readonly id: ID
  readonly rev: number
}

type RowMap<T> = Readonly<Record<ID, T>>

/**
 * The honest typing of a lookup. Without `noUncheckedIndexedAccess`, `map[id]`
 * claims to return `T` for a key that is not there, which would make every
 * "have we seen this row?" test below a lie. `Object.hasOwn` also stops an id
 * that happens to spell a prototype member — `constructor`, `toString` — from
 * resolving to something off `Object.prototype` and reading as an existing row.
 */
function lookup<T>(map: RowMap<T>, id: ID): T | undefined {
  return Object.hasOwn(map, id) ? map[id] : undefined
}

/**
 * The monotonic gate. Returns the same map reference when the event is stale, so
 * the caller can detect "nothing happened" by identity rather than by comparing
 * contents.
 *
 * An UPDATE for a row we have never seen is an INSERT: Realtime does not promise
 * to deliver the original INSERT, so refusing to create the row here would leave
 * a card permanently invisible until the next refetch.
 */
function foldVersioned<T extends Versioned>(map: RowMap<T>, row: T): RowMap<T> {
  const held = lookup(map, row.id)
  if (held !== undefined && row.rev <= held.rev) return map
  return { ...map, [row.id]: row }
}

/**
 * `board_members` has no `rev`: it carries no `bump_rev` trigger and its primary
 * key is composite, so there is no per-row counter to compare. Roles and display
 * names change by deliberate action rather than by two people dragging at once,
 * so last-writer-by-arrival is the right trade — but we still need the
 * no-re-render contract to hold for a replayed roster event, and field equality
 * is the only monotonicity proxy available. Hence the explicit comparison rather
 * than an unconditional overwrite.
 */
function sameMember(a: MemberRow, b: MemberRow): boolean {
  return (
    a.board_id === b.board_id &&
    a.user_id === b.user_id &&
    a.role === b.role &&
    a.display_name === b.display_name &&
    a.color === b.color &&
    a.joined_at === b.joined_at
  )
}

function foldMember(map: RowMap<MemberRow>, row: MemberRow): RowMap<MemberRow> {
  const held = lookup(map, row.user_id)
  if (held !== undefined && sameMember(held, row)) return map
  return { ...map, [row.user_id]: row }
}

/**
 * Remove a row by key, or return the same map if it was not there. Built by
 * copying rather than by `delete` on a clone, because the input maps are shared
 * with the currently rendered snapshot and must not be touched.
 */
function dropRow<T>(map: RowMap<T>, id: ID): RowMap<T> {
  if (!Object.hasOwn(map, id)) return map
  const next: Record<ID, T> = {}
  for (const key of Object.keys(map)) {
    if (key !== id) next[key] = map[key]
  }
  return next
}

/** Key a list of rows by id. Later rows win, which only matters for a malformed fetch. */
function byId<T extends { id: ID }>(rows: readonly T[]): RowMap<T> {
  const map: Record<ID, T> = {}
  for (const row of rows) map[row.id] = row
  return map
}

/**
 * The state before the first fetch resolves.
 *
 * `fetchedAt: 0` is load-bearing: the reducer drops an arriving snapshot whose
 * `fetchedAt` is older than the one it holds, so that a slow reconnect fetch
 * cannot overwrite a newer one. Zero makes every real fetch unambiguously newer,
 * without this function needing a clock it is not allowed to read.
 */
export function emptySnapshot(boardId: ID): BoardSnapshot {
  return { boardId, title: '', columns: {}, cards: {}, members: {}, fetchedAt: 0 }
}

/**
 * Build a snapshot from the rows a fetch returned.
 *
 * Rows are trusted to belong to `boardId` — they came from our own query, scoped
 * by board id and filtered again by RLS. `reconcile` is the untrusted path,
 * because its input is pushed to us, and that is where the board check lives.
 *
 * Members are keyed by `user_id`: `MemberRow`'s primary key is
 * `(board_id, user_id)` and within one board's snapshot the user is the identity.
 */
export function snapshotFromRows(
  boardId: ID,
  title: string,
  rows: {
    columns: readonly ColumnRow[]
    cards: readonly CardRow[]
    members: readonly MemberRow[]
  },
  fetchedAt: number,
): BoardSnapshot {
  const members: Record<ID, MemberRow> = {}
  for (const row of rows.members) members[row.user_id] = row

  return {
    boardId,
    title,
    columns: byId(rows.columns),
    cards: byId(rows.cards),
    members,
    fetchedAt,
  }
}

/**
 * Fold one change event into the snapshot.
 *
 * Returns the SAME object when the event changes nothing — a different board, a
 * stale `rev`, a delete of a row we do not hold. Callers depend on that by
 * identity; see the module comment.
 *
 * An archive is not reachable here as a DELETE. We soft-delete, so archiving
 * arrives as an UPDATE with `archived_at` set and the row stays in the map;
 * `project()` is what hides it. That is deliberate: a hard DELETE bypasses RLS
 * entirely and ships only the primary key, which tells a subscriber nothing.
 */
export function reconcile(snapshot: BoardSnapshot, event: ChangeEvent): BoardSnapshot {
  // One channel per board, but a channel is reused across `boardId` changes if the
  // teardown is ever missed, which presents as cross-board events. Cheap to refuse.
  if (event.boardId !== snapshot.boardId) return snapshot

  // Defence in depth on the same point: the event envelope's board id is assigned
  // by the adapter, while `record.board_id` is what the database actually stored.
  // If they disagree, something upstream normalised the event wrongly.
  if (event.operation !== 'DELETE' && event.record.board_id !== snapshot.boardId) {
    return snapshot
  }

  switch (event.table) {
    case 'cards': {
      const cards =
        event.operation === 'DELETE'
          ? dropRow(snapshot.cards, event.old_record.id)
          : foldVersioned(snapshot.cards, event.record)
      return cards === snapshot.cards ? snapshot : { ...snapshot, cards }
    }
    case 'columns': {
      const columns =
        event.operation === 'DELETE'
          ? dropRow(snapshot.columns, event.old_record.id)
          : foldVersioned(snapshot.columns, event.record)
      return columns === snapshot.columns ? snapshot : { ...snapshot, columns }
    }
    case 'board_members': {
      const members =
        event.operation === 'DELETE'
          ? dropRow(snapshot.members, event.old_record.id)
          : foldMember(snapshot.members, event.record)
      return members === snapshot.members ? snapshot : { ...snapshot, members }
    }
  }
}

/**
 * The one empty result, shared. `ackedCommands` returns it for the overwhelming
 * majority of events — everything written by anyone else — so handing back a
 * fresh `[]` each time would defeat any identity check the reducer wants to make
 * before touching the queue.
 */
const NO_ACKS: readonly ID[] = []

/**
 * Which of MY queued commands this event confirms.
 *
 * `origin_client_id` is the gate, not `origin_cmd_id`. Command ids are minted
 * client-side and written into a row the author controls, so a client can put any
 * string it likes in `origin_cmd_id` — including the id of a command sitting in my
 * queue. Honouring that would let another client ack my pending write, dropping my
 * optimistic value while the real write was still in flight. Checking that the row
 * was written by my own client id first bounds the damage to nothing: the worst a
 * forged `origin_cmd_id` achieves is an ack of a command nobody has.
 *
 * A null `origin_cmd_id` is an RPC or migration write (`create_board`,
 * `join_board`) — a real change to reconcile, but not an answer to anything in my
 * queue.
 *
 * A list rather than a single id because one row is already allowed to satisfy
 * several commands: the queue supersedes a pending envelope for the same target,
 * and coalescing three drags of one card into one write is explicitly sanctioned.
 * Note that the signature carries no board id, so pairing this with the matching
 * `reconcile` call for the same board is the caller's job.
 */
export function ackedCommands(event: ChangeEvent, clientId: ID): readonly ID[] {
  if (event.originClientId !== clientId) return NO_ACKS
  if (event.originCmdId === null) return NO_ACKS
  return [event.originCmdId]
}
