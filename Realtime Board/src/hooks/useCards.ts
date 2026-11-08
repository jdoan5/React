import { useCallback } from 'react'
import { planCardCreate, planCardMove, planColumnMove, planRebalance } from '../lib/ordering'
import { uuid } from '../utils/ids'
import { useBoardContext } from './useBoard'
import type { CardPatch } from '../sync/adapter'
import type { ID } from '../types'

/**
 * Card intents.
 *
 * Every one plans against the PROJECTION — the snapshot plus my own unconfirmed
 * edits — so two quick drags of the same card compose instead of the second one
 * planning against a stale list.
 *
 * Each returns void and applies optimistically; there is nothing to await,
 * because the queue owns what happens next.
 */
export function useCards() {
  const { projection, issue } = useBoardContext()

  const createCard = useCallback(
    (columnId: ID, title: string) => {
      const trimmed = title.trim()
      if (!trimmed) return
      issue({
        kind: 'card.create',
        cardId: uuid(),
        columnId,
        title: trimmed,
        orderKey: planCardCreate(projection, columnId),
      })
    },
    [projection, issue],
  )

  const moveCard = useCallback(
    (cardId: ID, toColumnId: ID, toIndex: number) => {
      // null means the drop changed nothing — no command, no write, no traffic.
      const plan = planCardMove(projection, cardId, toColumnId, toIndex)
      if (!plan) return
      issue({
        kind: 'card.move',
        cardId: plan.cardId,
        toColumnId: plan.toColumnId,
        orderKey: plan.orderKey,
      })
    },
    [projection, issue],
  )

  const editCard = useCallback(
    (cardId: ID, patch: CardPatch) => {
      if (Object.keys(patch).length === 0) return
      issue({ kind: 'card.edit', cardId, patch })
    },
    [issue],
  )

  const archiveCard = useCallback(
    (cardId: ID) => issue({ kind: 'card.archive', cardId }),
    [issue],
  )

  const moveColumn = useCallback(
    (columnId: ID, toIndex: number) => {
      const plan = planColumnMove(projection, columnId, toIndex)
      if (!plan) return
      issue({ kind: 'column.move', columnId: plan.columnId, orderKey: plan.orderKey })
    },
    [projection, issue],
  )

  /**
   * Rewrites every row in the column, which is exactly what fractional indexing
   * exists to avoid — so it is a button the user presses, never automatic.
   */
  const rebalanceColumn = useCallback(
    (columnId: ID) => {
      for (const plan of planRebalance(projection, columnId)) {
        issue({
          kind: 'card.move',
          cardId: plan.cardId,
          toColumnId: plan.toColumnId,
          orderKey: plan.orderKey,
        })
      }
    },
    [projection, issue],
  )

  return { createCard, moveCard, editCard, archiveCard, moveColumn, rebalanceColumn }
}
