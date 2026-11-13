import { useCallback } from 'react'
import { inviteUrl } from '../lib/boardLink'
import { useBoardContext } from './useBoard'

/**
 * The open board's invite link. Read fresh from the server on demand rather
 * than kept in state: any member may read the share token through RLS, and
 * not caching it means a rotated token can never be handed out stale.
 */
export function useInvite() {
  const { adapter, boardId, mode } = useBoardContext()

  const getLink = useCallback(async (): Promise<string | null> => {
    const token = await adapter.inviteToken(boardId)
    return token ? inviteUrl(window.location.href, boardId, token) : null
  }, [adapter, boardId])

  return { available: mode === 'supabase', getLink }
}
