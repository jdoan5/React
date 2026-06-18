import type { BoardState, ID, Task } from '../types'

// Every state change flows through one of these actions. The reducer is the
// single source of truth, which keeps drag-and-drop, the modal, and the
// simulated collaborators all consistent.
//
// Optional `actorId` lets the simulated-collaborator engine attribute an action
// to someone other than you. When omitted, the reducer uses `currentUserId`.

export type Action =
  | { type: 'ADD_TASK'; columnId: ID; title: string; actorId?: ID }
  | {
      type: 'UPDATE_TASK'
      taskId: ID
      patch: Partial<Omit<Task, 'id' | 'createdAt' | 'createdBy'>>
      actorId?: ID
    }
  | { type: 'DELETE_TASK'; taskId: ID; actorId?: ID }
  | { type: 'MOVE_TASK'; taskId: ID; toColumnId: ID; toIndex: number }
  | { type: 'MOVE_COLUMN'; fromIndex: number; toIndex: number }
  | { type: 'ADD_COLUMN'; title: string; actorId?: ID }
  | { type: 'RENAME_COLUMN'; columnId: ID; title: string }
  | { type: 'DELETE_COLUMN'; columnId: ID; actorId?: ID }
  | { type: 'SET_WIP_LIMIT'; columnId: ID; limit: number | null }
  | { type: 'SET_CURRENT_USER'; userId: ID }
  | { type: 'SET_PRESENCE'; userId: ID; online: boolean }
  | { type: 'LOG'; userId: ID; message: string }
  | { type: 'HYDRATE'; state: BoardState }
  | { type: 'RESET' }
