import { useMemo } from 'react'
import { partitionSelf } from '../lib/presence'
import { useBoardContext } from './useBoard'

/**
 * The avatar row. One human in three tabs is ONE collaborator with tabs: 3 —
 * collapsing that is lib/presence.ts's job, and it is exactly the
 * phantom-collaborator illusion the old Workflow Board faked.
 */
export function usePresence() {
  const { state } = useBoardContext()
  return useMemo(() => {
    const { me, others } = partitionSelf(state.presence)
    return { me, others, roster: state.presence }
  }, [state.presence])
}
