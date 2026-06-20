import type { Habit, HabitState, Weekday } from '../types'
import { addDays, todayISO, weekdayOf } from '../utils/date'
import { DAILY, WEEKDAYS } from '../constants'

// A self-contained factory so "Reset" rebuilds a fresh demo (relative to today).
// Each habit gets a recent unbroken streak, then a capping miss, then a noisier
// history — so streaks, longest-runs, and the heatmap all look believable.

interface Spec {
  id: string
  name: string
  emoji: string
  color: string
  schedule: Weekday[]
  /** Length of the current (recent) streak in due-days. */
  streak: number
  /** Varies the older miss pattern per habit. */
  seed: number
}

const SPECS: Spec[] = [
  { id: 'h_water', name: 'Drink water', emoji: '💧', color: '#3b82f6', schedule: DAILY, streak: 18, seed: 2 },
  { id: 'h_read', name: 'Read 20 minutes', emoji: '📚', color: '#f59e0b', schedule: DAILY, streak: 9, seed: 3 },
  { id: 'h_workout', name: 'Workout', emoji: '💪', color: '#ef4444', schedule: WEEKDAYS, streak: 6, seed: 1 },
  { id: 'h_meditate', name: 'Meditate', emoji: '🧘', color: '#8b5cf6', schedule: DAILY, streak: 23, seed: 5 },
  { id: 'h_journal', name: 'Journal', emoji: '✍️', color: '#14b8a6', schedule: [1, 2, 3, 4, 5, 6], streak: 4, seed: 4 },
]

export function createInitialState(): HabitState {
  const today = todayISO()
  const createdAt = addDays(today, -120)
  const habits: Record<string, Habit> = {}
  const completions: Record<string, Record<string, true>> = {}
  const order: string[] = []

  for (const spec of SPECS) {
    habits[spec.id] = {
      id: spec.id,
      name: spec.name,
      emoji: spec.emoji,
      color: spec.color,
      schedule: spec.schedule,
      createdAt,
      archived: false,
    }
    order.push(spec.id)

    const map: Record<string, true> = {}
    let dueSeen = 0
    for (let offset = 1; offset <= 120; offset += 1) {
      const iso = addDays(today, -offset)
      if (!spec.schedule.includes(weekdayOf(iso) as Weekday)) continue
      dueSeen += 1
      let done: boolean
      if (dueSeen <= spec.streak) done = true
      else if (dueSeen === spec.streak + 1) done = false
      else done = (dueSeen + spec.seed) % 5 !== 0 && (dueSeen * 3 + spec.seed) % 8 !== 0
      if (done) map[iso] = true
    }
    completions[spec.id] = map
  }

  return { habits, order, completions }
}
