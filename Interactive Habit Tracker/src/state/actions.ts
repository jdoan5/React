import type { HabitState, ID, Weekday } from '../types'

export type HabitPatch = Partial<{
  name: string
  emoji: string
  color: string
  schedule: Weekday[]
  archived: boolean
}>

export type Action =
  | { type: 'ADD_HABIT'; name: string; emoji: string; color: string; schedule: Weekday[] }
  | { type: 'UPDATE_HABIT'; id: ID; patch: HabitPatch }
  | { type: 'DELETE_HABIT'; id: ID }
  | { type: 'TOGGLE_COMPLETION'; id: ID; date: string }
  | { type: 'HYDRATE'; state: HabitState }
  | { type: 'RESET' }
