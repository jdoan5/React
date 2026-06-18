import type { ID, Task } from '../types'

export interface Filters {
  search: string
  assigneeId: ID | null
  labelId: ID | null
}

export const EMPTY_FILTERS: Filters = { search: '', assigneeId: null, labelId: null }

export function filtersActive(f: Filters): boolean {
  return f.search.trim() !== '' || f.assigneeId !== null || f.labelId !== null
}

/** Does a task pass the current toolbar filters? */
export function taskMatchesFilters(task: Task, f: Filters): boolean {
  if (f.assigneeId && task.assigneeId !== f.assigneeId) return false
  if (f.labelId && !task.labelIds.includes(f.labelId)) return false
  const q = f.search.trim().toLowerCase()
  if (q && !`${task.title} ${task.description}`.toLowerCase().includes(q)) return false
  return true
}
