import { useContext } from 'react'
import { BoardContext, type BoardContextValue } from '../state/contexts'

/**
 * The only way into the board. Components call intent-named hooks and never
 * touch a dispatch or an adapter — the same rule the rest of the repo follows.
 */
export function useBoardContext(): BoardContextValue {
  const value = useContext(BoardContext)
  if (!value) throw new Error('useBoardContext must be used inside <BoardProvider>')
  return value
}

export function useBoard() {
  const { projection, state, mode, reason, me } = useBoardContext()
  return {
    board: projection,
    status: state.status,
    detail: state.detail,
    mode,
    reason,
    me,
  }
}
