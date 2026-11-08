import { useMemo } from 'react'
import { rejectedOf, isDirty } from '../lib/commandQueue'
import { useBoardContext } from './useBoard'

/**
 * What the sync indicator renders: how much is unconfirmed, and what failed.
 *
 * Rejected commands are kept out of the projection (a rejected write did not
 * happen, so showing it would be a lie) but kept in the queue so the user can
 * be told rather than silently losing an edit.
 */
export function useSync() {
  const { state, retire } = useBoardContext()
  const rejected = useMemo(() => rejectedOf(state.queue), [state.queue])

  const pendingCount = useMemo(
    () =>
      state.queue.order.filter((id) => {
        const envelope = state.queue.byId[id]
        return envelope !== undefined && envelope.status !== 'rejected'
      }).length,
    [state.queue],
  )

  return {
    status: state.status,
    detail: state.detail,
    pendingCount,
    dirty: isDirty(state.queue),
    rejected,
    dismiss: retire,
  }
}
