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

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js'
import type { CardRow, Collaborator, ColumnRow, ID, MemberRow } from '../types'
import { colorFor, guestNameFor, uuid } from '../utils/ids'
import { collapsePresence, presencePayload, type PresenceEntry } from '../lib/presence'
import type {
  BoardSnapshot,
  CommitResult,
  CursorPing,
  Envelope,
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

export function createSupabaseAdapter(url: string, anonKey: string): SyncAdapter {
  const supabase: SupabaseClient = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
    // The cursor stream is the only high-rate producer, and it is lossy by
    // design, so there is no reason to let it queue without bound.
    realtime: { params: { eventsPerSecond: 30 } },
  })

  const clientId = uuid()
  let channel: RealtimeChannel | null = null

  /** Anonymous sign-in. Must be enabled in the dashboard — see supabase/README.md. */
  async function ensureSession(): Promise<string> {
    const { data } = await supabase.auth.getSession()
    if (data.session?.user) return data.session.user.id
    const { data: signed, error } = await supabase.auth.signInAnonymously()
    if (error || !signed.user) {
      throw new SyncRejection(
        'denied',
        `Anonymous sign-in failed (${error?.message ?? 'no user'}). ` +
          'Enable it under Authentication → Sign In / Providers.',
      )
    }
    return signed.user.id
  }

  return {
    mode: 'supabase',
    clientId,

    async identify(boardId: ID): Promise<Collaborator> {
      const userId = await ensureSession()
      const name = guestNameFor(userId)
      const color = colorFor(userId)

      // Already a member? Then keep whatever name they chose previously.
      const { data: existing } = await supabase
        .from('board_members')
        .select('user_id, display_name, color')
        .eq('board_id', boardId)
        .eq('user_id', userId)
        .maybeSingle()

      if (existing) {
        return { userId, name: existing.display_name, color: existing.color, tabs: 1 }
      }

      // Joining goes through the RPC so the share token is validated server-side;
      // there is deliberately no INSERT policy on board_members.
      const { error } = await supabase.rpc('join_board', {
        p_board_id: boardId,
        p_token: boardId, // share token travels in the URL alongside the board id
        p_name: name,
        p_color: color,
      })
      if (error) fail(error, 'Could not join this board')

      return { userId, name, color, tabs: 1 }
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
