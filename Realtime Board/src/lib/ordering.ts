/**
 * The total order over cards, and the translation from "dropped at index N" to
 * an absolute order key.
 *
 * `fracIndex.ts` answers "what key sits between these two?". This module answers
 * the two questions the board actually asks:
 *
 *   1. Given a drop, what single value should be written?
 *   2. Given a set of rows that arrived in any order, from any number of clients,
 *      what is THE order — identically, on every client?
 *
 * Both are pure: no React, no network, no clock.
 */

import { keyForIndex } from './fracIndex'

/** The minimum a row needs for ordering. Cards and columns both satisfy it. */
export interface Ordered {
  id: string
  orderKey: string
}

/**
 * The total order. Order key first, id as the tiebreak.
 *
 * The id tiebreak is LOAD-BEARING FOR CONVERGENCE, not cosmetic. `keyBetween` is
 * deterministic, so two clients that drop cards between the same two neighbours
 * without seeing each other both compute the same key — say `a0V`. That is a tie,
 * not corruption: both rows are valid and both survive. But order by key alone and
 * the pair's relative order is *undefined*, so the two clients can render them in
 * opposite orders, permanently, with neither ever correcting.
 *
 * Comparing ids breaks the tie the same way everywhere, including in Postgres:
 *
 *   SELECT ... ORDER BY order_key, id
 *
 * Ordering is done here, not in SQL — fetchSnapshot selects and sorts with this
 * function. The schema still has to agree, though, so `order_key` is declared
 * `COLLATE "C"` in 0001_schema.sql. Base-62 keys mix case and keyBetween(null,
 * 'a0') emits 'Zz', which must sort BEFORE 'a0'; byte order puts it there, while
 * a locale-aware collation (the cluster default on Supabase) sorts case-
 * insensitively and puts it last, inverting the board. "C" is plain byte order,
 * which is what `<` does here.
 */
export function compareOrder(a: Ordered, b: Ordered): number {
  if (a.orderKey < b.orderKey) return -1
  if (a.orderKey > b.orderKey) return 1
  if (a.id < b.id) return -1
  if (a.id > b.id) return 1
  return 0
}

/** A new array in canonical order. Never mutates its input. */
export function sortByOrder<T extends Ordered>(items: readonly T[]): T[] {
  return [...items].sort(compareOrder)
}

/**
 * The order key to write when `movingId` is dropped at `toIndex` of `items`.
 *
 * `toIndex` is the slot the card should occupy **in the list as the user sees it
 * at the moment of the drop** — which still contains the card being moved. This
 * function removes it first, so a move and a fresh insert are the same operation
 * and callers never have to reason about whether the index shifts.
 *
 * Returns null when the card is already in that slot, so the caller can skip the
 * write entirely rather than burn a revision on a no-op drag.
 */
export function planMove(
  items: readonly Ordered[],
  movingId: string,
  toIndex: number,
): string | null {
  const ordered = sortByOrder(items)
  const from = ordered.findIndex((item) => item.id === movingId)
  const without = from === -1 ? ordered : [...ordered.slice(0, from), ...ordered.slice(from + 1)]

  const target = Math.max(0, Math.min(toIndex, without.length))
  if (from === target && from !== -1) return null

  return keyForIndex(
    without.map((item) => item.orderKey),
    target,
  )
}

/**
 * The order key for a card moving into a different column, which is always an
 * insert: the card is not in `items`, so there is nothing to remove and no no-op
 * case to detect.
 */
export function planInsert(items: readonly Ordered[], toIndex: number): string {
  const ordered = sortByOrder(items)
  return keyForIndex(
    ordered.map((item) => item.orderKey),
    toIndex,
  )
}

/**
 * Where `id` currently sits, or -1. Callers use this to decide whether a drop
 * actually changed anything.
 */
export function indexOf(items: readonly Ordered[], id: string): number {
  return sortByOrder(items).findIndex((item) => item.id === id)
}

// ---------------------------------------------------------------------------
// Board-level planners
//
// Everything above works on plain lists and is what the tests hammer. These wrap
// it in the board's semantics: read the PROJECTION (snapshot + my own unconfirmed
// edits), and emit the single absolute value a command will carry.
//
// Planning against the projection rather than the snapshot is what makes two
// quick drags of the same card compose: the second one sees the first.
//
// The import below is type-only, so it is erased at compile time and the
// ordering <-> project cycle never exists at runtime.
// ---------------------------------------------------------------------------

import { maxKeyLength, rebalance as evenKeys } from './fracIndex'
import type { Projection } from './project'
import type { ID } from '../types'

export interface MovePlan {
  readonly cardId: ID
  readonly fromColumnId: ID
  readonly toColumnId: ID
  /**
   * Absolute. Emitted together with toColumnId in ONE command, so the row can
   * never end up holding one client's column with another client's key.
   */
  readonly orderKey: string
}

function orderedCards(p: Projection, columnId: ID): Ordered[] {
  const column = p.columns[columnId]
  if (!column) return []
  const out: Ordered[] = []
  for (const id of column.cardIds) {
    const card = p.cards[id]
    if (card) out.push({ id: card.id, orderKey: card.order_key })
  }
  return out
}

/** null when the drop changes nothing — no command, no write, no traffic. */
export function planCardMove(
  p: Projection,
  cardId: ID,
  toColumnId: ID,
  toIndex: number,
): MovePlan | null {
  const card = p.cards[cardId]
  if (!card || !p.columns[toColumnId]) return null

  const fromColumnId = card.column_id
  const target = orderedCards(p, toColumnId)

  const orderKey =
    fromColumnId === toColumnId
      ? planMove(target, cardId, toIndex)
      : planInsert(target, toIndex)

  if (orderKey === null) return null
  return { cardId, fromColumnId, toColumnId, orderKey }
}

export function planColumnMove(
  p: Projection,
  columnId: ID,
  toIndex: number,
): { columnId: ID; orderKey: string } | null {
  const items: Ordered[] = []
  for (const id of p.columnOrder) {
    const column = p.columns[id]
    if (column) items.push({ id: column.id, orderKey: column.order_key })
  }
  const orderKey = planMove(items, columnId, toIndex)
  return orderKey === null ? null : { columnId, orderKey }
}

/** Key for a brand-new card. Defaults to the end, which is where Add card puts it. */
export function planCardCreate(p: Projection, columnId: ID, atEnd = true): string {
  const items = orderedCards(p, columnId)
  return planInsert(items, atEnd ? items.length : 0)
}

export function planColumnCreate(p: Projection): string {
  const items: Ordered[] = []
  for (const id of p.columnOrder) {
    const column = p.columns[id]
    if (column) items.push({ id: column.id, orderKey: column.order_key })
  }
  return planInsert(items, items.length)
}

/**
 * Keys grow about one character per six repeated drags into the identical slot,
 * so this is a slow-burn condition rather than something that trips in normal
 * use. Figma's position is that normal usage never reaches a problematic length.
 */
export const REBALANCE_KEY_LENGTH = 12

export function needsRebalance(
  keys: readonly string[],
  maxLength: number = REBALANCE_KEY_LENGTH,
): boolean {
  return maxKeyLength(keys) >= maxLength
}

/**
 * Fresh short keys for a whole column, preserving the order currently on screen.
 *
 * This is the one operation that writes every row in a column, which is exactly
 * what fractional indexing exists to avoid — so it stays a deliberate action,
 * never something that fires automatically mid-drag.
 */
export function planRebalance(p: Projection, columnId: ID): readonly MovePlan[] {
  const items = orderedCards(p, columnId)
  if (items.length === 0) return []
  const fresh = evenKeys(items.length)
  const plans: MovePlan[] = []
  items.forEach((item, i) => {
    const key = fresh[i]!
    if (key === item.orderKey) return // already short and in place
    plans.push({ cardId: item.id, fromColumnId: columnId, toColumnId: columnId, orderKey: key })
  })
  return plans
}
