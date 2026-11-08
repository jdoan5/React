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
 *   SELECT ... ORDER BY order_key COLLATE "C", id
 *
 * The explicit `COLLATE "C"` matters. A locale-aware collation can sort
 * case-insensitively or ignore punctuation, which would disagree with JavaScript's
 * `<` on exactly the mixed-case keys base-62 produces. "C" is plain byte order,
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
