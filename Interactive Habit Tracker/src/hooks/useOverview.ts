import { useMemo } from 'react'
import { useHabitContext } from '../state/HabitContext'
import { useHabits } from './useHabits'
import { currentStreak, overallToday } from '../utils/streaks'
import { todayISO } from '../utils/date'

/** Board-wide numbers for the header: today's completion plus streak aggregates. */
export function useOverview() {
  const { state } = useHabitContext()
  const { activeHabits } = useHabits()

  return useMemo(() => {
    const today = todayISO()
    const todayRate = overallToday(activeHabits, state.completions, today)

    let bestStreak = 0
    let totalStreak = 0
    for (const habit of activeHabits) {
      const streak = currentStreak(habit, state.completions[habit.id], today)
      totalStreak += streak
      if (streak > bestStreak) bestStreak = streak
    }

    return { today, todayRate, activeCount: activeHabits.length, bestStreak, totalStreak }
  }, [activeHabits, state.completions])
}
