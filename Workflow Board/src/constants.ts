import type { Priority } from './types'

export const STORAGE_KEY = 'workflow-board:state:v1'

/** UI metadata for each priority level. `order` drives "sort by priority". */
export const PRIORITY_META: Record<Priority, { label: string; color: string; order: number }> = {
  urgent: { label: 'Urgent', color: '#ef4444', order: 0 },
  high: { label: 'High', color: '#f97316', order: 1 },
  medium: { label: 'Medium', color: '#eab308', order: 2 },
  low: { label: 'Low', color: '#22c55e', order: 3 },
}

/** Priorities in display order (used by selects and the edit modal). */
export const PRIORITIES: Priority[] = ['urgent', 'high', 'medium', 'low']
