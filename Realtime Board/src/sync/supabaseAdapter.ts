/**
 * The Supabase adapter — real Postgres, real auth, real sync between browsers.
 *
 * Three transports on one channel, each chosen for what it is good at:
 *
 *   Postgres Changes  durable row edits. Server-filtered to this board, so a
 *                     client never receives rows it has no business seeing.
 *   Presence          who is on the board. Roster only, never per-frame.
 *   Broadcast         cursors. Ephemeral and lossy by design — a dropped cursor
 *                     frame is invisible, a dropped card move is a bug.
 *
 * On scale: for a very chatty board, broadcast-from-database (triggers that
 * publish row changes onto a channel) replaces Postgres Changes and avoids its
 * per-subscriber RLS re-check. The ChangeEvent shape in adapter.ts is already
 * the broadcast one precisely so that swap touches only this file and rows.ts.
 */

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import type { CardRow, Collaborator, ColumnRow, ID, MemberRow } from '../types'
import { colorFor, guestNameFor, uuid } from '../utils/ids'
import { collapsePresence, presencePayload, type PresenceEntry } from '../lib/presence'
import { isUuid } from '../lib/boardLink'
import { boardTitleFor, classifySignInFailure, joinDecision, NEEDS_INVITE_MESSAGE } from '../lib/frontDoor'
import type {
  BoardDirectory,
  BoardSnapshot,
  CommitResult,
  CursorPing,
  Envelope,
  NewBoard,
  SyncAdapter,
  SyncHandlers,
  SyncStatus,
} from './adapter'
import { SyncRejection } from './adapter'
import { reasonForPostgrestError, toChangeEvent, type PostgresChangesPayload } from './rows'

type AnyPayload = PostgresChangesPayload<Record<string, unknown>>

function fail(error: { code?: string; message: string } | null, fallback: string): never {
  const message = error?.message ?? fallback
  throw new SyncRejection(reasonForPostgrestError(error?.code, message), message)
}

/**
 * The signed-in user, signing in anonymously only when there is genuinely
 * nobody signed in.
 *
 * Two things this has to get right, both found in review against the
 * installed auth-js:
 *
 *  1. getSession() can answer `{ session: null, error }` while a perfectly
 *     good session is still in storage — an expired access token whose refresh
 *     just failed on a network blip (auth-js keeps the session and backs off for
 *     60s). Signing in at that moment would OVERWRITE that session, and the
 *     visitor would lose every board they belong to. So an error from
 *     getSession() is 'unavailable', never a reason to mint a new guest.
 *
 *  2. Two callers routinely arrive at once (React StrictMode runs the connect
 *     effect twice; the front door may be creating a board as the provider
 *     mounts). Two concurrent signInAnonymously() calls would mint TWO guests.
 *     So the in-flight sign-in is shared — but only while in flight. The RESULT
 *     is never cached: getSession() is a local read, and re-reading it each
 *     time means a session that is later lost is noticed, not papered over
 *     with a dead user id.
 */
const signingIn = new WeakMap<SupabaseClient, Promise<string>>()

async function ensureSession(supabase: SupabaseClient): Promise<string> {
  let { data, error } = await supabase.auth.getSession()
  if (data.session?.user) return data.session.user.id
  if (error && error.name !== 'AuthRetryableFetchError') {
    // The server REJECTED the refresh token (guest deleted, token revoked).
    // auth-js discards the session as it reports this, so a second read finds
    // storage empty: nothing is left to protect, and a fresh guest is right.
    // Reporting "check your connection" here would send the visitor round a
    // pointless Try-again loop before reaching the same place.
    ;({ data, error } = await supabase.auth.getSession())
    if (data.session?.user) return data.session.user.id
  }
  if (error) {
    throw new SyncRejection(
      'unavailable',
      `Could not refresh your session (${error.message}). Check your connection and try again.`,
    )
  }

  let pending = signingIn.get(supabase)
  if (!pending) {
    pending = (async () => {
      const { data: signed, error: signInError } = await supabase.auth.signInAnonymously()
      if (signInError) {
        const verdict = classifySignInFailure(signInError)
        throw new SyncRejection(verdict.reason, verdict.message)
      }
      if (!signed.user) throw new SyncRejection('unavailable', 'Sign-in returned no user.')
      return signed.user.id
    })()
    signingIn.set(supabase, pending)
    const settled = pending
    void settled.then(
      () => signingIn.delete(supabase),
      () => signingIn.delete(supabase),
    )
  }
  return pending
}

/** PGRST202: PostgREST has no such function — the migrations have not been run. */
function missingMigration(error: { code?: string } | null): boolean {
  return error?.code === 'PGRST202'
}

export function createSupabaseAdapter(supabase: SupabaseClient): SyncAdapter {
  const clientId = uuid()
  let channel: RealtimeChannel | null = null

  return {
    mode: 'supabase',
    clientId,

    async identify(boardId: ID, invite?: string | null): Promise<Collaborator> {
      const userId = await ensureSession(supabase)
      const name = guestNameFor(userId)
      const color = colorFor(userId)

      // Already a member? Then keep whatever name they chose previously, and
      // never ask for the token again.
      const { data: existing, error: memberError } = await supabase
        .from('board_members')
        .select('user_id, display_name, color')
        .eq('board_id', boardId)
        .eq('user_id', userId)
        .maybeSingle()
      // Failing here must not fall through to "not a member": a dropped request
      // would then tell a real member they need an invite link.
      //
      // 42501 on THIS read means the request went out with no user token — a
      // token that lapsed between getSession() and now, so supabase-js fell
      // back to the anon key, which has no grant on board_members. A signed-in
      // read here is only ever filtered by RLS, never refused. So it is a
      // session problem (retryable), not a verdict on the board — mapping it to
      // 'denied' would make the front door forget a board the visitor owns.
      if (memberError?.code === '42501') {
        throw new SyncRejection('unavailable', 'Your session lapsed while the board was loading. Try again.')
      }
      if (memberError) fail(memberError, 'Could not check your access to this board')

      switch (joinDecision(existing !== null, invite)) {
        case 'member':
          return { userId, name: existing!.display_name, color: existing!.color, tabs: 1 }

        case 'needs-invite':
          throw new SyncRejection('denied', NEEDS_INVITE_MESSAGE)

        case 'join': {
          // Joining goes through the RPC so the share token is validated
          // server-side; there is deliberately no INSERT policy on board_members.
          const { error } = await supabase.rpc('join_board', {
            p_board_id: boardId,
            p_token: invite,
            p_name: name,
            p_color: color,
          })
          if (error && /invalid share link/i.test(error.message)) {
            // One message for "wrong token" and "no such board": telling them
            // apart would let a link be probed for which boards exist.
            throw new SyncRejection(
              'denied',
              'That invite link does not match a board. It may be mistyped, or the board may have been removed.',
            )
          }
          // 23505 unique_violation: a concurrent join_board() for this same
          // visitor won the race — StrictMode's second connect, or the link
          // opened in two tabs at once. The membership exists, which is all
          // this call was for. (0005 makes the SQL itself race-free; this
          // keeps a database still on 0003 working too.)
          if (error && error.code !== '23505') fail(error, 'Could not join this board')
          return { userId, name, color, tabs: 1 }
        }
      }
    },

    async inviteToken(boardId: ID): Promise<string | null> {
      const { data, error } = await supabase
        .from('boards')
        .select('share_token')
        .eq('id', boardId)
        .single()
      if (error) fail(error, 'Could not read the invite link')
      const token = (data as { share_token?: unknown } | null)?.share_token
      return isUuid(token) ? token.toLowerCase() : null
    },

    async fetchSnapshot(boardId: ID): Promise<BoardSnapshot> {
      // Three reads in parallel. RLS is the access control; the explicit
      // board_id filter is what keeps the query sargable — the docs are blunt
      // that RLS should not be relied on as your filter.
      const [boardRes, columnsRes, cardsRes, membersRes] = await Promise.all([
        supabase.from('boards').select('id, title').eq('id', boardId).single(),
        supabase.from('columns').select('*').eq('board_id', boardId).is('archived_at', null),
        supabase.from('cards').select('*').eq('board_id', boardId).is('archived_at', null),
        supabase.from('board_members').select('*').eq('board_id', boardId),
      ])

      if (boardRes.error) fail(boardRes.error, 'Board not found')
      if (columnsRes.error) fail(columnsRes.error, 'Could not load columns')
      if (cardsRes.error) fail(cardsRes.error, 'Could not load cards')
      if (membersRes.error) fail(membersRes.error, 'Could not load members')

      const columns: Record<ID, ColumnRow> = {}
      for (const row of (columnsRes.data ?? []) as ColumnRow[]) columns[row.id] = row
      const cards: Record<ID, CardRow> = {}
      for (const row of (cardsRes.data ?? []) as CardRow[]) cards[row.id] = row
      const members: Record<ID, MemberRow> = {}
      for (const row of (membersRes.data ?? []) as MemberRow[]) members[row.user_id] = row

      return {
        boardId,
        title: boardRes.data?.title ?? 'Board',
        columns,
        cards,
        members,
        fetchedAt: Date.now(),
      }
    },

    subscribe(boardId: ID, me: Collaborator, handlers: SyncHandlers): () => void {
      handlers.onStatus('connecting')

      // `private: true` routes the channel through Realtime Authorization, so
      // the RLS policies on realtime.messages decide who may listen.
      const ch = supabase.channel(`board:${boardId}`, {
        config: { private: true, presence: { key: me.userId } },
      })
      channel = ch

      const filter = `board_id=eq.${boardId}`
      for (const table of ['cards', 'columns', 'board_members'] as const) {
        ch.on(
          'postgres_changes',
          { event: '*', schema: 'public', table, filter },
          (payload) => {
            const event = toChangeEvent(table, boardId, payload as unknown as AnyPayload)
            // A malformed frame is dropped, never thrown on — one bad message
            // must not tear down the board's subscription.
            if (event) handlers.onChange(event)
          },
        )
      }

      ch.on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState() as unknown as Record<string, PresenceEntry[]>
        handlers.onPresence(collapsePresence(state, me.userId))
      })

      ch.on('broadcast', { event: 'cursor' }, ({ payload }) => {
        const ping = payload as CursorPing
        if (ping && ping.userId !== me.userId) handlers.onCursor(ping)
      })

      ch.subscribe((status, err) => {
        const map: Record<string, SyncStatus> = {
          SUBSCRIBED: 'live',
          CHANNEL_ERROR: 'reconnecting',
          TIMED_OUT: 'reconnecting',
          CLOSED: 'offline',
        }
        const next = map[status] ?? 'connecting'
        handlers.onStatus(next, err?.message)

        if (status === 'SUBSCRIBED') {
          void ch.track(presencePayload(me, Date.now()))
          // Fires on first connect AND on every reconnect. Realtime guarantees
          // no delivery and Postgres Changes has no replay, so every (re)connect
          // is a hole in the stream of unknown size — the caller refetches here.
          handlers.onLive()
        }
      })

      return () => {
        void supabase.removeChannel(ch)
        if (channel === ch) channel = null
        handlers.onStatus('offline')
      }
    },

    async commit(boardId: ID, envelope: Envelope): Promise<CommitResult> {
      const command = envelope.command
      const stamp = { origin_client_id: clientId, origin_cmd_id: envelope.id }
      // `rev` and `updated_at` are assigned by trigger — never sent from here, so
      // a client cannot pin a row at a revision the server did not grant.

      const run = async (
        table: 'cards' | 'columns',
        op: 'upsert' | 'update',
        values: Record<string, unknown>,
        id: ID,
      ): Promise<CommitResult> => {
        const query =
          op === 'upsert'
            ? supabase.from(table).upsert({ ...values, ...stamp }).select().single()
            : supabase.from(table).update({ ...values, ...stamp }).eq('id', id).select().single()

        const { data, error } = await query
        if (error) fail(error, `Could not write ${table}`)
        if (!data) throw new SyncRejection('missing', `${table} row ${id} no longer exists`)

        return {
          change: {
            table,
            boardId,
            operation: op === 'upsert' ? 'INSERT' : 'UPDATE',
            record: data as CardRow & ColumnRow,
            old_record: { id },
            originClientId: clientId,
            originCmdId: envelope.id,
          } as CommitResult['change'],
        }
      }

      switch (command.kind) {
        case 'card.create':
          return run(
            'cards',
            'upsert',
            {
              id: command.cardId,
              board_id: boardId,
              column_id: command.columnId,
              title: command.title,
              order_key: command.orderKey,
              created_by: envelope.actorId,
            },
            command.cardId,
          )

        case 'card.move':
          // Column and key in ONE update: the row can never hold one client's
          // column with another client's key.
          return run(
            'cards',
            'update',
            { column_id: command.toColumnId, order_key: command.orderKey },
            command.cardId,
          )

        case 'card.edit':
          return run('cards', 'update', { ...command.patch }, command.cardId)

        case 'card.archive':
          return run('cards', 'update', { archived_at: new Date().toISOString() }, command.cardId)

        case 'column.create':
          return run(
            'columns',
            'upsert',
            {
              id: command.columnId,
              board_id: boardId,
              title: command.title,
              order_key: command.orderKey,
            },
            command.columnId,
          )

        case 'column.move':
          return run('columns', 'update', { order_key: command.orderKey }, command.columnId)

        case 'column.rename':
          return run('columns', 'update', { title: command.title }, command.columnId)

        case 'column.archive':
          return run(
            'columns',
            'update',
            { archived_at: new Date().toISOString() },
            command.columnId,
          )
      }
    },

    async setPresence(_boardId: ID, me: Collaborator): Promise<void> {
      await channel?.track(presencePayload(me, Date.now()))
    },

    sendCursor(_boardId: ID, ping: CursorPing): void {
      // Fire and forget. Cursors are lossy by design, and a failed send must
      // never surface as an error the user sees.
      void channel?.send({ type: 'broadcast', event: 'cursor', payload: ping })
    },
  }
}

export function createSupabaseDirectory(supabase: SupabaseClient): BoardDirectory {
  return {
    async createBoard(): Promise<NewBoard> {
      const userId = await ensureSession(supabase)
      const name = guestNameFor(userId)
      const title = boardTitleFor(name)

      // create_board() makes the board, the owner's membership and the four
      // default columns in one transaction (0005) — there is no INSERT
      // policy on boards, so this is the only way in.
      const { data, error } = await supabase.rpc('create_board', {
        p_title: title,
        p_name: name,
        p_color: colorFor(userId),
      })
      if (missingMigration(error)) {
        throw new SyncRejection(
          'unavailable',
          'The database has no create_board() function yet. Run the SQL files in supabase/migrations, in order.',
        )
      }
      if (error) fail(error, 'Could not create a board')

      const row = data as { id?: unknown; share_token?: unknown; title?: unknown } | null
      if (!row || !isUuid(row.id) || !isUuid(row.share_token)) {
        throw new SyncRejection('invalid', 'create_board() returned no board')
      }
      return {
        boardId: row.id.toLowerCase(),
        invite: row.share_token.toLowerCase(),
        title: typeof row.title === 'string' && row.title ? row.title : title,
      }
    },
  }
}
