/**
 * Domain model.
 *
 * Rows mirror the SQL in supabase/migrations exactly, including snake_case, so
 * there is no guessing about what came back from Postgres. The camelCase domain
 * types are what the UI sees; `src/sync/` is the only place that converts.
 *
 * Ordering is a string `order_key`, never an integer position — see
 * src/lib/fracIndex.ts for why.
 */

export type ID = string

export type Priority = 'urgent' | 'high' | 'medium' | 'low'

export type MemberRole = 'owner' | 'editor' | 'viewer'

/** Which adapter is backing the board — surfaced in the UI, never inferred twice. */
export type SyncMode = 'supabase' | 'demo'

export type SyncStatus = 'connecting' | 'live' | 'offline' | 'error'

// --- Rows, exactly as Postgres returns them --------------------------------

export interface CardRow {
  id: ID
  board_id: ID
  column_id: ID
  title: string
  description: string
  assignee_id: ID | null
  priority: Priority
  due_date: string | null
  order_key: string
  archived_at: string | null
  rev: number
  origin_client_id: string | null
  origin_cmd_id: string | null
  created_by: ID
  created_at: string
  updated_at: string
}

export interface ColumnRow {
  id: ID
  board_id: ID
  title: string
  order_key: string
  archived_at: string | null
  rev: number
  origin_client_id: string | null
  origin_cmd_id: string | null
  updated_at: string
}

export interface MemberRow {
  board_id: ID
  user_id: ID
  role: MemberRole
  display_name: string
  color: string
  joined_at: string
}

// --- Domain types, as the UI sees them -------------------------------------

export interface Card {
  id: ID
  columnId: ID
  title: string
  description: string
  assigneeId: ID | null
  priority: Priority
  dueDate: string | null
  /** Fractional index. Sorts lexicographically; ties break on id. */
  orderKey: string
  /** Server-assigned and monotonic. An event at or below this rev is stale. */
  rev: number
}

export interface Column {
  id: ID
  title: string
  orderKey: string
  rev: number
}

/** A person on the board right now. One human in three tabs is one collaborator. */
export interface Collaborator {
  userId: ID
  name: string
  color: string
  /** How many tabs they have open — why one person is not three avatars. */
  tabs: number
}

/** The authoritative state, as last heard from the server. */
export interface BoardSnapshot {
  boardId: ID
  title: string
  columns: Record<ID, Column>
  cards: Record<ID, Card>
}
