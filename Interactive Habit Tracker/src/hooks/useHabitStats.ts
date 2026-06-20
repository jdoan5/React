import { useMemo } from 'react'
import { useHabitContext } from '../state/HabitContext'
import type { Habit } from '../types'
import { addDays, todayISO } from '../utils/date'
import { completionRate, currentStreak, isDue, longestStreak } from '../utils/streaks'
import { RATE_WINDOW_DAYS } from '../constants'

/** All derived numbers for a single habit card. */
export function useHabitStats(habit: Habit) {
  const { state } = useHabitContext()
  const completions = state.completions[habit.id]

  return useMemo(() => {
    const today = todayISO()
    const from = addDays(today, -(RATE_WINDOW_DAYS - 1))
    return {
      today,
      currentStreak: currentStreak(habit, completions, today),
      longestStreak: longestStreak(habit, completions, today),
      rate: completionRate(habit, completions, from, today),
      dueToday: isDue(habit, today),
      doneToday: !!completions && completions[today] === true,
      completions,
    }
  }, [habit, completions])
}
