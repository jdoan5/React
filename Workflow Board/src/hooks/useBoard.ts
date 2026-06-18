import { useMemo } from 'react'
import { useBoardContext } from '../state/BoardContext'
import type { ID, Task } from '../types'

type TaskPatch = Partial<Omit<Task, 'id' | 'createdAt' | 'createdBy'>>

/**
 * Primary board API: the current state plus stable, memoised action creators.
 * Components never dispatch raw actions — they call these intent-named helpers.
 */
export function useBoard() {
  const { state, dispatch } = useBoardContext()

  const actions = useMemo(
    () => ({
      addTask: (columnId: ID, title: string) => dispatch({ type: 'ADD_TASK', columnId, title }),
      updateTask: (taskId: ID, patch: TaskPatch) => dispatch({ type: 'UPDATE_TASK', taskId, patch }),
      deleteTask: (taskId: ID) => dispatch({ type: 'DELETE_TASK', taskId }),
      moveTask: (taskId: ID, toColumnId: ID, toIndex: number) =>
        dispatch({ type: 'MOVE_TASK', taskId, toColumnId, toIndex }),
      moveColumn: (fromIndex: number, toIndex: number) =>
        dispatch({ type: 'MOVE_COLUMN', fromIndex, toIndex }),
      addColumn: (title: string) => dispatch({ type: 'ADD_COLUMN', title }),
      renameColumn: (columnId: ID, title: string) =>
        dispatch({ type: 'RENAME_COLUMN', columnId, title }),
      deleteColumn: (columnId: ID) => dispatch({ type: 'DELETE_COLUMN', columnId }),
      setWipLimit: (columnId: ID, limit: number | null) =>
        dispatch({ type: 'SET_WIP_LIMIT', columnId, limit }),
      /** Attribute a one-off activity entry (used for drag "moved" events). */
      log: (userId: ID, message: string) => dispatch({ type: 'LOG', userId, message }),
      resetBoard: () => dispatch({ type: 'RESET' }),
    }),
    [dispatch],
  )

  return { state, ...actions }
}
