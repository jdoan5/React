// Domain model for the Interactive Habit Tracker.

export type ID = string

/** 0 = Sunday … 6 = Saturday (matches Date.getDay()). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface Habit {
  id: ID
  name: string
  emoji: string
  color: string
  /** Weekdays the habit is "due". Daily = all seven. */
  schedule: Weekday[]
  /** ISO date (yyyy-mm-dd) the habit started counting from. */
  createdAt: string
  archived: boolean
}

export interface HabitState {
  habits: Record<ID, Habit>
  order: ID[]
  /** habitId -> { 'yyyy-mm-dd': true } for each completed day. */
  completions: Record<ID, Record<string, true>>
}
