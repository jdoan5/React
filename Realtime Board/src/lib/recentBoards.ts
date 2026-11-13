/**
 * Boards this browser has opened, newest first, so a returning visitor lands
 * back on their own board instead of being handed a new one.
 *
 * Membership lives in Postgres; this list is only a pointer to it. A stale
 * entry is harmless — opening it either still works, or fails with a clear
 * message and is forgotten.
 *
 * The share token is deliberately NOT stored. A member can always re-read
 * their board's token through RLS, so copying it into localStorage would only
 * widen where the capability lives, for no gain.
 *
 * Pure: the caller owns localStorage (see utils/recentsStore.ts).
 */

import type { ID } from '../types'
import { isUuid } from './boardLink'

export interface RecentBoard {
  readonly id: ID
  readonly title: string
  readonly openedAt: number
}

export const RECENTS_STORAGE_KEY = 'realtime-board:boards:v1'
export const MAX_RECENTS = 12

function isRecent(value: unknown): value is RecentBoard {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    isUuid(v.id) &&
    typeof v.title === 'string' &&
    typeof v.openedAt === 'number' &&
    Number.isFinite(v.openedAt)
  )
}

/** Newest first, one entry per board, capped. Never throws on bad input. */
function normalise(list: readonly RecentBoard[]): RecentBoard[] {
  const seen = new Set<ID>()
  const out: RecentBoard[] = []
  for (const entry of [...list].sort((a, b) => b.openedAt - a.openedAt)) {
    if (seen.has(entry.id)) continue
    seen.add(entry.id)
    out.push(entry)
    if (out.length === MAX_RECENTS) break
  }
  return out
}

/**
 * Corrupt JSON, a foreign value under our key, or one bad entry must never
 * cost the visitor the rest of their list — bad entries are dropped, not fatal.
 */
export function parseRecents(raw: string | null): RecentBoard[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return normalise(
    parsed
      .filter(isRecent)
      .map((e) => ({ id: e.id.toLowerCase(), title: e.title, openedAt: e.openedAt })),
  )
}

/** Move a board to the front. An empty title keeps the one already on file. */
export function rememberBoard(
  list: readonly RecentBoard[],
  board: { readonly id: ID; readonly title: string },
  now: number,
): RecentBoard[] {
  const id = board.id.toLowerCase()
  const previous = list.find((e) => e.id === id)
  const title = board.title || previous?.title || ''
  return normalise([{ id, title, openedAt: now }, ...list.filter((e) => e.id !== id)])
}

export function forgetBoard(list: readonly RecentBoard[], id: ID): RecentBoard[] {
  const target = id.toLowerCase()
  return list.filter((e) => e.id !== target)
}

export function serializeRecents(list: readonly RecentBoard[]): string {
  return JSON.stringify(list)
}

const UNTITLED = 'Untitled board'

/**
 * What to call each board in a list. Guests cannot rename boards, so every
 * board one guest creates shares a title ("Swift Vole's board"). Those get a
 * suffix from the end of their id, grown one character at a time until every
 * board in that group is distinct — a fixed-length prefix or suffix can
 * collide, the full ids cannot. Stable across reorderings, unlike a position
 * number, because it depends only on which boards share the title.
 */
export function recentLabels(list: readonly RecentBoard[]): Map<ID, string> {
  const groups = new Map<string, ID[]>()
  for (const board of list) {
    const title = board.title || UNTITLED
    groups.set(title, [...(groups.get(title) ?? []), board.id])
  }
  const labels = new Map<ID, string>()
  for (const [title, ids] of groups) {
    if (ids.length === 1) {
      labels.set(ids[0]!, title)
      continue
    }
    let length = 4
    while (length < 36 && new Set(ids.map((id) => id.slice(-length))).size < ids.length) length++
    for (const id of ids) labels.set(id, `${title} · ${id.slice(-length)}`)
  }
  return labels
}
