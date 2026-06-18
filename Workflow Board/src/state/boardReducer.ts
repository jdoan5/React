import type { ActivityEntry, BoardState, Column, ID, Task } from '../types'
import type { Action } from './actions'
import { createInitialState } from '../data/seed'
import { uid } from '../utils/id'
import { arrayMove, clamp } from '../utils/array'

const ACTIVITY_LIMIT = 80

function findColumnOfTask(state: BoardState, taskId: ID): ID | undefined {
  return state.columnOrder.find((cid) => state.columns[cid]?.taskIds.includes(taskId))
}

/** Prepend an activity entry, keeping the feed bounded. */
function log(state: BoardState, userId: ID, message: string): ActivityEntry[] {
  const entry: ActivityEntry = { id: uid('a'), userId, message, timestamp: Date.now() }
  return [entry, ...state.activity].slice(0, ACTIVITY_LIMIT)
}

function patchColumns(state: BoardState, patch: Record<ID, Column>): BoardState {
  return { ...state, columns: { ...state.columns, ...patch } }
}

/** Remove a task from its column and insert it into the target at `toIndex`. */
function moveTask(state: BoardState, taskId: ID, toColumnId: ID, toIndex: number): BoardState {
  const fromColumnId = findColumnOfTask(state, taskId)
  const fromColumn = fromColumnId ? state.columns[fromColumnId] : undefined
  const toColumn = state.columns[toColumnId]
  if (!fromColumn || !toColumn) return state

  if (fromColumnId === toColumnId) {
    const oldIndex = fromColumn.taskIds.indexOf(taskId)
    const newIndex = clamp(toIndex, 0, fromColumn.taskIds.length - 1)
    if (oldIndex === -1 || oldIndex === newIndex) return state
    return patchColumns(state, {
      [fromColumn.id]: { ...fromColumn, taskIds: arrayMove(fromColumn.taskIds, oldIndex, newIndex) },
    })
  }

  const fromIds = fromColumn.taskIds.filter((id) => id !== taskId)
  const toIds = toColumn.taskIds.filter((id) => id !== taskId)
  toIds.splice(clamp(toIndex, 0, toIds.length), 0, taskId)
  return patchColumns(state, {
    [fromColumn.id]: { ...fromColumn, taskIds: fromIds },
    [toColumn.id]: { ...toColumn, taskIds: toIds },
  })
}

export function boardReducer(state: BoardState, action: Action): BoardState {
  switch (action.type) {
    case 'ADD_TASK': {
      const column = state.columns[action.columnId]
      const title = action.title.trim()
      if (!column || !title) return state
      const actor = action.actorId ?? state.currentUserId
      const task: Task = {
        id: uid('t'),
        title,
        description: '',
        assigneeId: null,
        priority: 'medium',
        labelIds: [],
        dueDate: null,
        createdAt: Date.now(),
        createdBy: actor,
      }
      return {
        ...patchColumns(state, { [column.id]: { ...column, taskIds: [...column.taskIds, task.id] } }),
        tasks: { ...state.tasks, [task.id]: task },
        activity: log(state, actor, `added “${title}”`),
      }
    }

    case 'UPDATE_TASK': {
      const task = state.tasks[action.taskId]
      if (!task) return state
      const actor = action.actorId ?? state.currentUserId
      const updated: Task = { ...task, ...action.patch }
      let message: string
      if ('assigneeId' in action.patch) {
        const name = updated.assigneeId ? state.users[updated.assigneeId]?.name : null
        message = name ? `assigned “${updated.title}” to ${name}` : `unassigned “${updated.title}”`
      } else {
        message = `updated “${updated.title}”`
      }
      return {
        ...state,
        tasks: { ...state.tasks, [task.id]: updated },
        activity: log(state, actor, message),
      }
    }

    case 'DELETE_TASK': {
      const task = state.tasks[action.taskId]
      if (!task) return state
      const actor = action.actorId ?? state.currentUserId
      const columnId = findColumnOfTask(state, task.id)
      const tasks = { ...state.tasks }
      delete tasks[task.id]
      const next = columnId
        ? patchColumns(state, {
            [columnId]: {
              ...state.columns[columnId],
              taskIds: state.columns[columnId].taskIds.filter((id) => id !== task.id),
            },
          })
        : state
      return { ...next, tasks, activity: log(state, actor, `deleted “${task.title}”`) }
    }

    case 'MOVE_TASK':
      // Fires continuously during a drag, so this is intentionally silent — the
      // Board logs a single "moved" entry when the drag settles in a new column.
      return moveTask(state, action.taskId, action.toColumnId, action.toIndex)

    case 'MOVE_COLUMN':
      return { ...state, columnOrder: arrayMove(state.columnOrder, action.fromIndex, action.toIndex) }

    case 'ADD_COLUMN': {
      const actor = action.actorId ?? state.currentUserId
      const title = action.title.trim() || 'New List'
      const column: Column = { id: uid('c'), title, taskIds: [], wipLimit: null }
      return {
        ...patchColumns(state, { [column.id]: column }),
        columnOrder: [...state.columnOrder, column.id],
        activity: log(state, actor, `added list “${title}”`),
      }
    }

    case 'RENAME_COLUMN': {
      const column = state.columns[action.columnId]
      const title = action.title.trim()
      if (!column || !title) return state
      return patchColumns(state, { [column.id]: { ...column, title } })
    }

    case 'DELETE_COLUMN': {
      const column = state.columns[action.columnId]
      if (!column) return state
      const actor = action.actorId ?? state.currentUserId
      const columns = { ...state.columns }
      delete columns[column.id]
      const tasks = { ...state.tasks }
      for (const tid of column.taskIds) delete tasks[tid]
      return {
        ...state,
        columns,
        tasks,
        columnOrder: state.columnOrder.filter((id) => id !== column.id),
        activity: log(state, actor, `deleted list “${column.title}”`),
      }
    }

    case 'SET_WIP_LIMIT': {
      const column = state.columns[action.columnId]
      if (!column) return state
      return patchColumns(state, { [column.id]: { ...column, wipLimit: action.limit } })
    }

    case 'SET_CURRENT_USER': {
      const user = state.users[action.userId]
      if (!user) return state
      return {
        ...state,
        currentUserId: user.id,
        users: { ...state.users, [user.id]: { ...user, online: true } },
      }
    }

    case 'SET_PRESENCE': {
      const user = state.users[action.userId]
      if (!user || user.online === action.online) return state
      return { ...state, users: { ...state.users, [user.id]: { ...user, online: action.online } } }
    }

    case 'LOG':
      return { ...state, activity: log(state, action.userId, action.message) }

    case 'HYDRATE':
      // Adopt another tab's board, but keep our own "acting as" identity.
      return { ...action.state, currentUserId: state.currentUserId }

    case 'RESET':
      return createInitialState()

    default:
      return state
  }
}
