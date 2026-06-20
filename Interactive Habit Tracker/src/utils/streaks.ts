// The core logic of the app: streaks and completion rates, expressed as pure
// functions of (habit, completions, today). Keeping them pure makes the tricky
// bits — schedule-aware streaks, the "today isn't over yet" grace period —
// straightforward to unit-test (see streaks.test.ts).

import type { Habit, ID, Weekday } from '../types'
import { addDays, weekdayOf, type ISODate } from './date'

export type CompletionSet = Record<string, true> | undefined

export interface RateResult {
  done: number
  total: number
  /** 0..1 */
  pct: number
}

/** Is the habit scheduled on this date's weekday? */
export function isDue(habit: Habit, iso: ISODate): boolean {
  return habit.schedule.includes(weekdayOf(iso) as Weekday)
}

function isDone(set: CompletionSet, iso: ISODate): boolean {
  return !!set && set[iso] === true
}

/**
 * Consecutive completed *due* days ending now. Non-due days (e.g. weekends for
 * a weekday habit) are skipped without breaking the chain. Today gets a grace
 * period: an unchecked-but-still-due today doesn't break a streak — it just
 * isn't counted yet.
 */
export function currentStreak(habit: Habit, set: CompletionSet, today: ISODate): number {
  let streak = 0
  let cursor = today
  if (isDue(habit, today) && !isDone(set, today)) {
    cursor = addDays(today, -1)
  }
  while (cursor >= habit.createdAt) {
    if (isDue(habit, cursor)) {
      if (isDone(set, cursor)) streak += 1
      else break
    }
    cursor = addDays(cursor, -1)
  }
  return streak
}

/** Longest run of completed due days at any point in the habit's history. */
export function longestStreak(habit: Habit, set: CompletionSet, today: ISODate): number {
  let best = 0
  let run = 0
  for (let cursor = habit.createdAt; cursor <= today; cursor = addDays(cursor, 1)) {
    if (!isDue(habit, cursor)) continue
    if (isDone(set, cursor)) {
      run += 1
      if (run > best) best = run
    } else if (cursor !== today) {
      run = 0 // a real miss resets; an unfinished today does not
    }
  }
  return Math.max(best, currentStreak(habit, set, today))
}

/** Completed vs scheduled due days within an inclusive [from, to] window. */
export function completionRate(habit: Habit, set: CompletionSet, from: ISODate, to: ISODate): RateResult {
  let done = 0
  let total = 0
  const start = from < habit.createdAt ? habit.createdAt : from
  for (let cursor = start; cursor <= to; cursor = addDays(cursor, 1)) {
    if (!isDue(habit, cursor)) continue
    total += 1
    if (isDone(set, cursor)) done += 1
  }
  return { done, total, pct: total === 0 ? 0 : done / total }
}

/** Today's progress across all active habits that are due today. */
export function overallToday(
  habits: Habit[],
  completions: Record<ID, CompletionSet>,
  today: ISODate,
): RateResult {
  let done = 0
  let total = 0
  for (const habit of habits) {
    if (habit.archived || !isDue(habit, today)) continue
    total += 1
    if (isDone(completions[habit.id], today)) done += 1
  }
  return { done, total, pct: total === 0 ? 0 : done / total }
}
