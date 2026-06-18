import { useMemo } from 'react'
import { useBoardContext } from '../state/BoardContext'

/** The recent activity log, with each entry's user resolved for rendering. */
export function useActivityFeed(limit = 40) {
  const { state } = useBoardContext()
  return useMemo(
    () =>
      state.activity
        .slice(0, limit)
        .map((entry) => ({ entry, user: state.users[entry.userId] })),
    [state.activity, state.users, limit],
  )
}
