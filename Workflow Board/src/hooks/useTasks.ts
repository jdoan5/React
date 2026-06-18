import { useCallback, useMemo } from 'react'
import { useBoardContext } from '../state/BoardContext'
import type { ID } from '../types'
import { isOverdue } from '../utils/format'

/** Task-centric selectors and board-wide stats for the toolbar. */
export function useTasks() {
  const { state } = useBoardContext()

  const allTasks = useMemo(() => Object.values(state.tasks), [state.tasks])

  const stats = useMemo(() => {
    const total = allTasks.length
    const overdue = allTasks.filter((t) => t.dueDate && isOverdue(t.dueDate)).length
    const unassigned = allTasks.filter((t) => !t.assigneeId).length
    const done = state.columnOrder.length
      ? (state.columns[state.columnOrder[state.columnOrder.length - 1]]?.taskIds.length ?? 0)
      : 0
    return { total, overdue, unassigned, done }
  }, [allTasks, state.columns, state.columnOrder])

  const getColumnTasks = useCallback(
    (columnId: ID) => {
      const col = state.columns[columnId]
      return col ? col.taskIds.map((id) => state.tasks[id]).filter(Boolean) : []
    },
    [state.columns, state.tasks],
  )

  return { allTasks, stats, getColumnTasks }
}
