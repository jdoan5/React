/**
 * Row types — exactly what Postgres returns, snake_case and all, mirroring
 * supabase/migrations. Keeping the wire shape honest means there is never a
 * question of what came back from the database.
 *
 * The sync-layer types (snapshot, commands, events) live in src/sync/adapter.ts,
 * which is the seam between the app and whichever transport is backing it.
 */

export type ID = string

export type Priority = 'urgent' | 'high' | 'medium' | 'low'

export type MemberRole = 'owner' | 'editor' | 'viewer'

export interface CardRow {
  id: ID
  board_id: ID
  column_id: ID
  title: string
  description: string
  assignee_id: ID | null
  priority: Priority
  due_date: string | null
  /** Fractional index. Sorts lexicographically; ties break on id. */
  order_key: string
  /** Soft delete — RLS cannot police a DELETE, so archiving is an UPDATE. */
  archived_at: string | null
  /** Server-assigned by trigger, monotonic. An event at or below this is stale. */
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

/**
 * A person on the board right now. One human with three tabs open is ONE
 * collaborator — collapsing that is the whole job of lib/presence.ts, and it is
 * exactly the phantom-collaborator illusion the old Workflow Board's simulated
 * engine created, which this app exists to stop faking.
 */
export interface Collaborator {
  userId: ID
  name: string
  color: string
  /** How many tabs they have open. */
  tabs: number
}
