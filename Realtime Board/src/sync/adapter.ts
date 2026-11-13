/**
 * THE SEAM.
 *
 * Types only — this file has no runtime code, so nothing above it in the
 * dependency graph can accidentally reach a transport. Everything above it
 * (lib/, state/, hooks/, components/) is written against these types alone and
 * cannot tell Postgres from a BroadcastChannel. Two implementations live beside
 * it: supabaseAdapter.ts and localAdapter.ts.
 *
 * `import type` is mandatory here — tsconfig sets verbatimModuleSyntax. No enums
 * and no constructor parameter properties anywhere: erasableSyntaxOnly.
 */

import type { CardRow, Collaborator, ColumnRow, ID, MemberRow } from '../types'

/** Which transport is live. The only thing the UI reads to decide the demo badge. */
export type SyncMode = 'supabase' | 'local'

// ---------------------------------------------------------------------------
// Commands — what the local user asked for
// ---------------------------------------------------------------------------

export type CardPatch = Partial<
  Pick<CardRow, 'title' | 'description' | 'assignee_id' | 'priority' | 'due_date'>
>

/**
 * Every command names ABSOLUTE target state, never a delta. That single rule
 * buys idempotent replay, safe retry after a refresh, order-insensitive
 * application, and the right to coalesce three drags of one card into one write.
 *
 * Re-applying `{ orderKey: 'a1V' }` twice is a no-op. Re-applying `{ delta: +1 }`
 * twice is a corruption.
 *
 * Row ids are minted client-side, so a retried create is an upsert on the primary
 * key rather than a duplicate row, and there is no temp-id remapping anywhere.
 */
export type Command =
  | { readonly kind: 'card.create'; readonly cardId: ID; readonly columnId: ID; readonly title: string; readonly orderKey: string }
  | { readonly kind: 'card.move'; readonly cardId: ID; readonly toColumnId: ID; readonly orderKey: string }
  | { readonly kind: 'card.edit'; readonly cardId: ID; readonly patch: CardPatch }
  | { readonly kind: 'card.archive'; readonly cardId: ID }
  | { readonly kind: 'column.create'; readonly columnId: ID; readonly title: string; readonly orderKey: string }
  | { readonly kind: 'column.move'; readonly columnId: ID; readonly orderKey: string }
  | { readonly kind: 'column.rename'; readonly columnId: ID; readonly title: string }
  | { readonly kind: 'column.archive'; readonly columnId: ID }

export type CommandStatus = 'pending' | 'inflight' | 'rejected'

/** A Command plus the bookkeeping the queue owns. Immutable; the reducer replaces it. */
export interface Envelope {
  /** Client-minted. Written to the row as origin_cmd_id, so the echo acks itself. */
  readonly id: ID
  readonly command: Command
  readonly actorId: ID
  readonly issuedAt: number
  readonly attempts: number
  /** Epoch ms. `nextDue` will not hand this envelope back before then. */
  readonly nextAttemptAt: number
  readonly status: CommandStatus
  readonly rejection?: RejectionInfo
}

// ---------------------------------------------------------------------------
// Change events — what the server says happened
// ---------------------------------------------------------------------------

/**
 * Normalised AT THE ADAPTER EDGE to the broadcast-from-database shape
 * (`operation` / `record` / `old_record`), NOT the Postgres Changes shape
 * (`eventType` / `new` / `old`). Mixing the two field-name sets is a silent bug,
 * and `operation`/`record` is the direction Supabase is steering. The local
 * adapter synthesises this shape trivially. `sync/rows.ts` is the only file where
 * the Postgres Changes names may appear.
 */
export interface Origin {
  /** Which client wrote this. An ack counts only if this equals our own clientId. */
  readonly originClientId: ID | null
  /** The command id that client attached. Null for RPC and migration writes. */
  readonly originCmdId: ID | null
}

/**
 * `old_record` is deliberately typed as primary-key-only.
 *
 * With RLS enabled, `replica identity full` does NOT populate it past the primary
 * key, and there is no workaround. So `old.order_key !== record.order_key` is
 * always true against `undefined` — the classic version of this bug. Typing it
 * this way makes reading any other field a COMPILE ERROR rather than a comment
 * nobody reads. We diff against our own snapshot instead. Never widen this type.
 */
export type RowChange<T> =
  | { readonly operation: 'INSERT' | 'UPDATE'; readonly record: T; readonly old_record: { readonly id: ID } | null }
  /** Only reachable via the optional postgres_changes transport. We soft-delete. */
  | { readonly operation: 'DELETE'; readonly record: null; readonly old_record: { readonly id: ID } }

export type ChangeEvent =
  | ({ readonly table: 'cards'; readonly boardId: ID } & RowChange<CardRow> & Origin)
  | ({ readonly table: 'columns'; readonly boardId: ID } & RowChange<ColumnRow> & Origin)
  | ({ readonly table: 'board_members'; readonly boardId: ID } & RowChange<MemberRow> & Origin)

// ---------------------------------------------------------------------------
// Snapshot, status, rejection
// ---------------------------------------------------------------------------

/**
 * Authoritative state. Written ONLY by fetchSnapshot, change events and commit
 * results. The UI never writes it; the queue layers on top at projection time.
 */
export interface BoardSnapshot {
  readonly boardId: ID
  readonly title: string
  readonly columns: Readonly<Record<ID, ColumnRow>>
  readonly cards: Readonly<Record<ID, CardRow>>
  readonly members: Readonly<Record<ID, MemberRow>>
  readonly fetchedAt: number
}

export type SyncStatus = 'connecting' | 'live' | 'reconnecting' | 'offline'

export type RejectionReason =
  /** RLS said no, or the role is 'viewer'. Terminal — retrying cannot help. */
  | 'denied'
  /** Target row or column is gone (FK violation, archived concurrently). Terminal. */
  | 'missing'
  /** Check constraint or malformed order key. Terminal; a bug on our side. */
  | 'invalid'
  /** Socket down, 5xx, timeout. Retryable with backoff. */
  | 'unavailable'

export interface RejectionInfo {
  readonly reason: RejectionReason
  readonly message: string
}

/** Fields assigned in the constructor BODY — erasableSyntaxOnly bans parameter properties. */
export class SyncRejection extends Error {
  readonly reason: RejectionReason
  readonly retryable: boolean

  constructor(reason: RejectionReason, message: string) {
    super(message)
    this.name = 'SyncRejection'
    this.reason = reason
    this.retryable = reason === 'unavailable'
  }
}

/**
 * A successful commit returns the authoritative row the server wrote, so the
 * snapshot advances AND the command is acked in ONE reducer dispatch — without
 * waiting for the realtime echo. The echo arrives milliseconds later and is a
 * no-op, discarded by the `rev` guard in reconcile().
 *
 * That is what makes my own writes correct even when the socket is dead:
 * realtime is an accelerator for OTHER people's changes, never a dependency of
 * mine.
 */
export interface CommitResult {
  readonly change: ChangeEvent
}

/** Ephemeral, lossy, high-frequency. Never persisted, never reconciled. */
export interface CursorPing {
  readonly userId: ID
  /** Board-relative fractions in 0..1, so a cursor lands right at any viewport. */
  readonly x: number
  readonly y: number
  readonly draggingCardId: ID | null
  /** Sender clock; used to discard out-of-order pings and expire stale ones. */
  readonly at: number
}

export interface SyncHandlers {
  onStatus(status: SyncStatus, detail?: string): void
  onChange(event: ChangeEvent): void
  /**
   * Fired on first connect AND on EVERY reconnect. The caller MUST re-fetch the
   * snapshot here: realtime guarantees no delivery and Postgres Changes has no
   * replay, so every (re)connect is a hole in the stream of unknown size.
   */
  onLive(): void
  /** Whole roster, re-derived on every sync. NEVER a delta. */
  onPresence(collaborators: readonly Collaborator[]): void
  /** Ephemeral. Must never reach the state that feeds project(). */
  onCursor(ping: CursorPing): void
}

// ---------------------------------------------------------------------------
// The interface
// ---------------------------------------------------------------------------

export interface SyncAdapter {
  readonly mode: SyncMode
  /** Stable per tab. Written to every row; distinguishes my echo from yours. */
  readonly clientId: ID

  /**
   * Supabase: anonymous sign-in, then join_board() with `invite` unless already
   * a member — a member never needs the token again, so reopening a board from
   * history works with none. A non-member with no token is refused with a
   * readable SyncRejection('denied'). Local: a persisted guest; `invite` is ignored.
   */
  identify(boardId: ID, invite?: string | null): Promise<Collaborator>

  /**
   * The board's share token, for building an invite link. Null in local mode,
   * which has no server to join through. Readable by any member via RLS.
   */
  inviteToken(boardId: ID): Promise<string | null>

  fetchSnapshot(boardId: ID): Promise<BoardSnapshot>

  /** Opens the stream and wires handlers. Returns teardown. onLive follows async. */
  subscribe(boardId: ID, me: Collaborator, handlers: SyncHandlers): () => void

  /**
   * Attempt exactly ONE command. Resolves with the committed row, or throws
   * SyncRejection.
   *
   * No conditional / compare-and-set writes: a move is last-writer-wins on one
   * row, made deterministic by `rev`. A CAS move would fail constantly under
   * contention and feel broken, where LWW converges.
   */
  commit(boardId: ID, envelope: Envelope): Promise<CommitResult>

  /** Roster only. Called once per identity change — never per frame. */
  setPresence(boardId: ID, me: Collaborator): Promise<void>

  /** Cursor or drag ghost. Fire-and-forget, throttled by the caller, never throws. */
  sendCursor(boardId: ID, ping: CursorPing): void
}

/** A board just made by create_board(), with the token for its invite link. */
export interface NewBoard {
  readonly boardId: ID
  readonly invite: string
  readonly title: string
}

/**
 * Making boards, as distinct from syncing one. Separate from SyncAdapter because
 * it is needed BEFORE there is a board to sync — the front door creates the
 * board, then mounts a provider for it. Supabase only: demo mode has its one
 * seeded board and nothing to create.
 */
export interface BoardDirectory {
  /** Signs in anonymously if needed; the board arrives with its default columns (0005). */
  createBoard(): Promise<NewBoard>
}

export interface AdapterChoice {
  readonly adapter: SyncAdapter
  readonly mode: SyncMode
  /** Shown in the demo badge when mode === 'local'. */
  readonly reason: string
}

/** Chaos knobs. The reason rollback and retry are demoable with no credentials. */
export interface LocalAdapterOptions {
  readonly latencyMs?: number
  /** 0..1. Injected rate of SyncRejection('unavailable') on commit. */
  readonly failureRate?: number
}
