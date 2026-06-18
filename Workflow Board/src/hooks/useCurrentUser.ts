import { useMemo } from 'react'
import { useBoardContext } from '../state/BoardContext'
import type { ID } from '../types'

/** The user you're currently acting as, the full roster, and presence helpers. */
export function useCurrentUser() {
  const { state, dispatch } = useBoardContext()

  const users = useMemo(() => Object.values(state.users), [state.users])
  const onlineUsers = useMemo(() => users.filter((u) => u.online), [users])
  const currentUser = state.users[state.currentUserId]

  return {
    currentUser,
    users,
    onlineUsers,
    switchUser: (userId: ID) => dispatch({ type: 'SET_CURRENT_USER', userId }),
    setPresence: (userId: ID, online: boolean) => dispatch({ type: 'SET_PRESENCE', userId, online }),
  }
}
