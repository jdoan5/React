// Domain model for the Workflow Board.
// State is kept "normalized": columns and tasks live in lookup maps keyed by id,
// and ordering is expressed with arrays of ids. This keeps moves/edits O(1) to
// find and makes drag-and-drop reordering simple array splices.

export type ID = string

export type Priority = 'urgent' | 'high' | 'medium' | 'low'

export interface User {
  id: ID
  name: string
  /** Avatar background colour. */
  color: string
  /** Mock presence flag, toggled by the simulated-collaborator engine. */
  online: boolean
}

export interface Label {
  id: ID
  name: string
  color: string
}

export interface Task {
  id: ID
  title: string
  description: string
  assigneeId: ID | null
  priority: Priority
  labelIds: ID[]
  /** ISO date (yyyy-mm-dd) or null when no due date is set. */
  dueDate: string | null
  createdAt: number
  createdBy: ID
}

export interface Column {
  id: ID
  title: string
  /** Ordered task ids belonging to this column. */
  taskIds: ID[]
  /** Optional work-in-progress limit; null = unlimited. */
  wipLimit: number | null
}

export interface ActivityEntry {
  id: ID
  /** The user the action is attributed to (you, or a simulated collaborator). */
  userId: ID
  message: string
  timestamp: number
}

export interface BoardState {
  columnOrder: ID[]
  columns: Record<ID, Column>
  tasks: Record<ID, Task>
  users: Record<ID, User>
  labels: Record<ID, Label>
  activity: ActivityEntry[]
  /** Whose identity you are currently acting as. */
  currentUserId: ID
}
