import { useMemo } from 'react'
import { useHabitContext } from '../state/HabitContext'
import type { HabitPatch } from '../state/actions'
import type { ID, Weekday } from '../types'

/** Primary habit API: state plus stable, intent-named action creators. */
export function useHabits() {
  const { state, dispatch } = useHabitContext()

  const actions = useMemo(
    () => ({
      addHabit: (name: string, emoji: string, color: string, schedule: Weekday[]) =>
        dispatch({ type: 'ADD_HABIT', name, emoji, color, schedule }),
      updateHabit: (id: ID, patch: HabitPatch) => dispatch({ type: 'UPDATE_HABIT', id, patch }),
      deleteHabit: (id: ID) => dispatch({ type: 'DELETE_HABIT', id }),
      setArchived: (id: ID, archived: boolean) => dispatch({ type: 'UPDATE_HABIT', id, patch: { archived } }),
      toggleCompletion: (id: ID, date: string) => dispatch({ type: 'TOGGLE_COMPLETION', id, date }),
      resetAll: () => dispatch({ type: 'RESET' }),
    }),
    [dispatch],
  )

  const orderedHabits = useMemo(
    () => state.order.map((id) => state.habits[id]).filter(Boolean),
    [state.order, state.habits],
  )
  const activeHabits = useMemo(() => orderedHabits.filter((h) => !h.archived), [orderedHabits])
  const archivedHabits = useMemo(() => orderedHabits.filter((h) => h.archived), [orderedHabits])

  return { state, ...actions, orderedHabits, activeHabits, archivedHabits }
}
