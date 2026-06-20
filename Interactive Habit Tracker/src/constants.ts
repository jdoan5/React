import type { Weekday } from './types'

export const STORAGE_KEY = 'habit-tracker:state:v1'

/** Single-letter labels indexed by weekday (0 = Sun). */
export const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const DAILY: Weekday[] = [0, 1, 2, 3, 4, 5, 6]
export const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5]
export const WEEKENDS: Weekday[] = [0, 6]

export const HABIT_COLORS = [
  '#6366f1', '#ec4899', '#14b8a6', '#f59e0b',
  '#8b5cf6', '#ef4444', '#22c55e', '#3b82f6',
]

export const HABIT_EMOJIS = [
  '💪', '📚', '🧘', '🏃', '💧', '🥗', '😴', '✍️',
  '🎯', '🎸', '🧹', '🌱', '💻', '🙏', '🚭', '📵',
]

/** How many weeks of history the heatmap shows. */
export const HEATMAP_WEEKS = 18
/** Rolling window (days) for the per-habit consistency ring. */
export const RATE_WINDOW_DAYS = 30
