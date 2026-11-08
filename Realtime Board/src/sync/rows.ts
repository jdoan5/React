/**
 * The ONLY file where Postgres Changes field names are allowed to appear.
 *
 * Supabase's realtime client hands Postgres Changes to you as
 * `{ eventType, new, old }`, while broadcast-from-database uses
 * `{ operation, record, old_record }`. Those are two different spellings of the
 * same thing, and letting both leak into the app is a silent bug waiting to
 * happen — the kind where a rename works in dev and a move silently doesn't.
 *
 * So everything above the seam speaks exactly one dialect (`operation` /
 * `record` / `old_record`, the broadcast one, which is the direction Supabase is
 * steering), and the translation happens here, once.
 */

import type { CardRow, ColumnRow, ID, MemberRow } from '../types'
import type { ChangeEvent } from './adapter'

/** The shape realtime-js delivers for a postgres_changes binding. */
export interface PostgresChangesPayload<T extends Record<string, unknown>> {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  schema: string
  table: string
  commit_timestamp: string
  errors: unknown
  /** `{}` on DELETE, never null. */
  new: T | Record<string, never>
  /**
   * Primary key only. With RLS enabled, `replica identity full` does NOT
   * populate this past the primary key and there is no workaround — which is
   * why ChangeEvent types it as `{ id }` and nothing reads further.
   */
  old: Partial<T> | Record<string, never>
}

type AnyRow = CardRow | ColumnRow | MemberRow

function hasId(value: unknown): value is { id: ID } {
  return typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string'
}

/** board_members has no `id` column — its identity is (board_id, user_id). */
function memberKey(row: Partial<MemberRow>): string {
  return `${row.board_id ?? ''}:${row.user_id ?? ''}`
}

/**
 * Translate one payload, or return null if it is unusable.
 *
 * Returning null rather than throwing is deliberate: this runs on every message
 * from a socket we do not control, and one malformed frame must not tear down
 * the subscription for the whole board.
 */
export function toChangeEvent(
  table: 'cards' | 'columns' | 'board_members',
  boardId: ID,
  payload: PostgresChangesPayload<Record<string, unknown>>,
): ChangeEvent | null {
  const record = (payload.new ?? {}) as Partial<AnyRow>
  const old = (payload.old ?? {}) as Partial<AnyRow>

  if (payload.eventType === 'DELETE') {
    // We soft-delete, so this is only reachable if someone removes a row by hand
    // or the optional postgres_changes transport is used on a hard delete. The
    // payload carries only the primary key — there is nothing else to read.
    const id = hasId(old) ? old.id : table === 'board_members' ? memberKey(old as MemberRow) : null
    if (!id) return null
    return {
      table,
      boardId,
      operation: 'DELETE',
      record: null,
      old_record: { id },
      originClientId: null,
      originCmdId: null,
    } as ChangeEvent
  }

  if (Object.keys(record).length === 0) return null

  // Rows from other boards should already be filtered server-side, but a
  // schema-wide binding or a stale filter would let one through.
  if ('board_id' in record && record.board_id !== boardId) return null

  const oldRef = hasId(old)
    ? { id: old.id }
    : table === 'board_members' && old.board_id
      ? { id: memberKey(old as MemberRow) }
      : null

  return {
    table,
    boardId,
    operation: payload.eventType,
    record,
    old_record: oldRef,
    originClientId: (record as CardRow).origin_client_id ?? null,
    originCmdId: (record as CardRow).origin_cmd_id ?? null,
  } as ChangeEvent
}

/**
 * Map a PostgREST error to a rejection reason.
 *
 * The distinction that matters is terminal vs retryable: retrying a 42501 (RLS
 * said no) forever is how a queue livelocks, and giving up on a dropped socket
 * is how an edit gets silently lost.
 */
export function reasonForPostgrestError(code: string | undefined, message: string) {
  // 42501 insufficient_privilege — RLS refused, or the role is 'viewer'.
  if (code === '42501' || /row-level security/i.test(message)) return 'denied' as const
  // 23503 foreign_key_violation — the column was archived underneath us.
  // PGRST116: no rows returned by a .single() that required one.
  if (code === '23503' || code === 'PGRST116') return 'missing' as const
  // 23514 check_violation, 22023 invalid_parameter_value, 22P02 invalid_text_representation.
  if (code === '23514' || code === '22023' || code === '22P02') return 'invalid' as const
  return 'unavailable' as const
}
