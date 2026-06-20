import type { Weekday } from '../types'
import { WEEKDAY_NAMES } from '../constants'

/** Human label for a schedule: "Every day", "Weekdays", "Mon, Wed, Fri", … */
export function scheduleLabel(schedule: Weekday[]): string {
  const s = [...schedule].sort((a, b) => a - b)
  if (s.length === 0) return 'No days'
  if (s.length === 7) return 'Every day'
  if (s.length === 5 && [1, 2, 3, 4, 5].every((d) => s.includes(d as Weekday))) return 'Weekdays'
  if (s.length === 2 && [0, 6].every((d) => s.includes(d as Weekday))) return 'Weekends'
  return s.map((d) => WEEKDAY_NAMES[d]).join(', ')
}

export function toggleWeekday(schedule: Weekday[], day: Weekday): Weekday[] {
  return schedule.includes(day)
    ? schedule.filter((d) => d !== day)
    : [...schedule, day].sort((a, b) => a - b)
}
