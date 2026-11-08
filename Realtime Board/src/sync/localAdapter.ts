/**
 * The credential-free adapter — demo mode.
 *
 * It is not a stub. It is a real implementation of the same interface, backed by
 * localStorage for durability and a BroadcastChannel for sync, so two tabs of the
 * same browser genuinely see each other's edits, presence and cursors in real
 * time. Everything above the seam — the queue, the projection, the reducer, every
 * component — runs unchanged against it.
 *
 * Same spirit as Interactive Stocks' demo-data fallback: a missing .env is a
 * labelled demo, never a crash.
 *
 * The two chaos knobs are the point of the whole thing. `latencyMs` makes the gap
 * between optimistic apply and server confirmation visible, and `failureRate`
 * makes rollback and retry something you can *watch* rather than something the
 * README claims. Neither is reachable in the Supabase adapter, where latency and
 * failure are real.
 */

import { DEMO_CHANNEL, STORAGE_KEYS } from '../constants'
import { colorFor, guestNameFor, uuid } from '../utils/ids'
import type { CardRow, Collaborator, ColumnRow, ID, MemberRow } from '../types'
import type {
  BoardSnapshot,
  ChangeEvent,
  CommitResult,
  CursorPing,
  Envelope,
  LocalAdapterOptions,
  SyncAdapter,
  SyncHandlers,
} from './adapter'
import { SyncRejection } from './adapter'

/** What travels between tabs. Mirrors the handler set, nothing more. */
type Wire =
  | { kind: 'change'; event: ChangeEvent }
  | { kind: 'presence'; from: ID; member: Collaborator; tabId: ID }
  | { kind: 'presence-leave'; tabId: ID }
  | { kind: 'presence-ping'; tabId: ID }
  | { kind: 'cursor'; ping: CursorPing }

interface StoredBoard {
  boardId: ID
  title: string
  columns: Record<ID, ColumnRow>
  cards: Record<ID, CardRow>
  members: Record<ID, MemberRow>
}

interface StoredIdentity {
  userId: ID
  name: string
  color: string
}

const nowIso = () => new Date().toISOString()

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? null : (JSON.parse(raw) as T)
  } catch {
    // Quota, private mode, or another app's malformed value under our key.
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Demo mode degrades to in-memory rather than failing the write.
  }
}

export function createLocalAdapter(
  seed: () => StoredBoard,
  options: LocalAdapterOptions = {},
): SyncAdapter {
  const latencyMs = Math.max(0, options.latencyMs ?? 180)
  const failureRate = Math.min(1, Math.max(0, options.failureRate ?? 0))

  const clientId = uuid()
  // A channel is cheap and the adapter outlives every subscription, so one is
  // opened here and closed only when the page goes away.
  const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(DEMO_CHANNEL) : null

  let board: StoredBoard | null = null

  function load(boardId: ID): StoredBoard {
    if (board) return board
    const stored = readJson<StoredBoard>(STORAGE_KEYS.board)
    board = stored && stored.boardId === boardId ? stored : seed()
    return board
  }

  function persist(): void {
    if (board) writeJson(STORAGE_KEYS.board, board)
  }

  function post(message: Wire): void {
    try {
      channel?.postMessage(message)
    } catch {
      // A structured-clone failure must never break the local write that caused it.
    }
  }

  /** Simulated network. Resolves after the configured latency, or throws. */
  async function wire(): Promise<void> {
    if (latencyMs > 0) await new Promise((r) => setTimeout(r, latencyMs))
    if (failureRate > 0) {
      // crypto rather than Math.random so the chaos is not a seeded-looking lie.
      const roll = crypto.getRandomValues(new Uint32Array(1))[0]! / 0x1_0000_0000
      if (roll < failureRate) {
        throw new SyncRejection('unavailable', 'Simulated network failure (demo chaos knob)')
      }
    }
  }

  function identity(): StoredIdentity {
    const stored = readJson<StoredIdentity>(STORAGE_KEYS.identity)
    if (stored?.userId) return stored
    const userId = uuid()
    const fresh: StoredIdentity = {
      userId,
      name: guestNameFor(userId),
      color: colorFor(userId),
    }
    writeJson(STORAGE_KEYS.identity, fresh)
    return fresh
  }

  return {
    mode: 'local',
    clientId,

    async identify(_boardId: ID): Promise<Collaborator> {
      const me = identity()
      return { userId: me.userId, name: me.name, color: me.color, tabs: 1 }
    },

    async fetchSnapshot(boardId: ID): Promise<BoardSnapshot> {
      const data = load(boardId)
      return {
        boardId: data.boardId,
        title: data.title,
        columns: { ...data.columns },
        cards: { ...data.cards },
        members: { ...data.members },
        fetchedAt: Date.now(),
      }
    },

    subscribe(boardId: ID, me: Collaborator, handlers: SyncHandlers): () => void {
      const tabId = clientId
      // userId -> set of tab ids, so one person in three tabs stays one avatar.
      const peers = new Map<ID, { member: Collaborator; tabs: Set<ID> }>()
      peers.set(me.userId, { member: me, tabs: new Set([tabId]) })

      function emitPresence(): void {
        handlers.onPresence(
          [...peers.values()]
            .map((p) => ({ ...p.member, tabs: p.tabs.size }))
            .sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0)),
        )
      }

      function onMessage(ev: MessageEvent<Wire>) {
        const msg = ev.data
        if (!msg || typeof msg !== 'object') return
        switch (msg.kind) {
          case 'change':
            if (msg.event.boardId !== boardId) return
            handlers.onChange(msg.event)
            // Another tab wrote to the same localStorage; drop our cache so the
            // next read picks their row up rather than our stale copy.
            board = null
            return
          case 'presence': {
            const entry = peers.get(msg.member.userId) ?? { member: msg.member, tabs: new Set<ID>() }
            entry.member = msg.member
            entry.tabs.add(msg.tabId)
            peers.set(msg.member.userId, entry)
            emitPresence()
            return
          }
          case 'presence-ping':
            // A new tab is asking who is here; answer so it learns about us.
            post({ kind: 'presence', from: me.userId, member: me, tabId })
            return
          case 'presence-leave': {
            for (const [userId, entry] of peers) {
              entry.tabs.delete(msg.tabId)
              if (entry.tabs.size === 0 && userId !== me.userId) peers.delete(userId)
            }
            emitPresence()
            return
          }
          case 'cursor':
            if (msg.ping.userId !== me.userId) handlers.onCursor(msg.ping)
            return
        }
      }

      channel?.addEventListener('message', onMessage)

      handlers.onStatus('connecting')
      // A microtask, not a timer: demo mode has nothing to wait for, but going
      // through the same connecting -> live transition as Supabase means the UI
      // has only one code path to get right.
      queueMicrotask(() => {
        handlers.onStatus('live')
        handlers.onLive()
        emitPresence()
        post({ kind: 'presence', from: me.userId, member: me, tabId })
        post({ kind: 'presence-ping', tabId })
      })

      const onUnload = () => post({ kind: 'presence-leave', tabId })
      window.addEventListener('pagehide', onUnload)

      return () => {
        channel?.removeEventListener('message', onMessage)
        window.removeEventListener('pagehide', onUnload)
        post({ kind: 'presence-leave', tabId })
        handlers.onStatus('offline')
      }
    },

    async commit(boardId: ID, envelope: Envelope): Promise<CommitResult> {
      await wire()

      const data = load(boardId)
      const command = envelope.command
      const stamp = { origin_client_id: clientId, origin_cmd_id: envelope.id, updated_at: nowIso() }

      let event: ChangeEvent

      switch (command.kind) {
        case 'card.create': {
          const existing = data.cards[command.cardId]
          // Client-minted ids mean a retry is an upsert, not a duplicate.
          const row: CardRow = existing
            ? { ...existing, ...stamp, rev: existing.rev + 1 }
            : {
                id: command.cardId,
                board_id: boardId,
                column_id: command.columnId,
                title: command.title,
                description: '',
                assignee_id: null,
                priority: 'medium',
                due_date: null,
                order_key: command.orderKey,
                archived_at: null,
                rev: 1,
                created_by: envelope.actorId,
                created_at: nowIso(),
                ...stamp,
              }
          data.cards[row.id] = row
          event = {
            table: 'cards',
            boardId,
            operation: existing ? 'UPDATE' : 'INSERT',
            record: row,
            old_record: existing ? { id: row.id } : null,
            originClientId: clientId,
            originCmdId: envelope.id,
          }
          break
        }

        case 'card.move':
        case 'card.edit':
        case 'card.archive': {
          const existing = data.cards[command.cardId]
          if (!existing) {
            throw new SyncRejection('missing', `Card ${command.cardId} no longer exists`)
          }
          let next: CardRow
          if (command.kind === 'card.move') {
            if (!data.columns[command.toColumnId]) {
              throw new SyncRejection('missing', 'That column was archived')
            }
            // Column and key move together in ONE write, so the row can never
            // hold one client's column with another client's key.
            next = { ...existing, column_id: command.toColumnId, order_key: command.orderKey }
          } else if (command.kind === 'card.edit') {
            next = { ...existing, ...command.patch }
          } else {
            next = { ...existing, archived_at: nowIso() }
          }
          next = { ...next, ...stamp, rev: existing.rev + 1 }
          data.cards[next.id] = next
          event = {
            table: 'cards',
            boardId,
            operation: 'UPDATE',
            record: next,
            old_record: { id: next.id },
            originClientId: clientId,
            originCmdId: envelope.id,
          }
          break
        }

        case 'column.create': {
          const existing = data.columns[command.columnId]
          const row: ColumnRow = existing
            ? { ...existing, ...stamp, rev: existing.rev + 1 }
            : {
                id: command.columnId,
                board_id: boardId,
                title: command.title,
                order_key: command.orderKey,
                archived_at: null,
                rev: 1,
                ...stamp,
              }
          data.columns[row.id] = row
          event = {
            table: 'columns',
            boardId,
            operation: existing ? 'UPDATE' : 'INSERT',
            record: row,
            old_record: existing ? { id: row.id } : null,
            originClientId: clientId,
            originCmdId: envelope.id,
          }
          break
        }

        case 'column.move':
        case 'column.rename':
        case 'column.archive': {
          const existing = data.columns[command.columnId]
          if (!existing) {
            throw new SyncRejection('missing', `Column ${command.columnId} no longer exists`)
          }
          let next: ColumnRow
          if (command.kind === 'column.move') {
            next = { ...existing, order_key: command.orderKey }
          } else if (command.kind === 'column.rename') {
            next = { ...existing, title: command.title }
          } else {
            next = { ...existing, archived_at: nowIso() }
          }
          next = { ...next, ...stamp, rev: existing.rev + 1 }
          data.columns[next.id] = next
          event = {
            table: 'columns',
            boardId,
            operation: 'UPDATE',
            record: next,
            old_record: { id: next.id },
            originClientId: clientId,
            originCmdId: envelope.id,
          }
          break
        }
      }

      persist()
      post({ kind: 'change', event })
      return { change: event }
    },

    async setPresence(_boardId: ID, me: Collaborator): Promise<void> {
      post({ kind: 'presence', from: me.userId, member: me, tabId: clientId })
    },

    sendCursor(_boardId: ID, ping: CursorPing): void {
      post({ kind: 'cursor', ping })
    },
  }
}
