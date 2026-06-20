import type { Habit, HabitState } from '../types'
import type { Action } from './actions'
import { createInitialState } from '../data/seed'
import { DAILY } from '../constants'
import { uid } from '../utils/id'
import { todayISO } from '../utils/date'

export function habitReducer(state: HabitState, action: Action): HabitState {
  switch (action.type) {
    case 'ADD_HABIT': {
      const habit: Habit = {
        id: uid('habit'),
        name: action.name.trim() || 'New habit',
        emoji: action.emoji,
        color: action.color,
        schedule: action.schedule.length ? action.schedule : DAILY,
        createdAt: todayISO(),
        archived: false,
      }
      return {
        ...state,
        habits: { ...state.habits, [habit.id]: habit },
        order: [...state.order, habit.id],
        completions: { ...state.completions, [habit.id]: {} },
      }
    }

    case 'UPDATE_HABIT': {
      const habit = state.habits[action.id]
      if (!habit) return state
      return { ...state, habits: { ...state.habits, [habit.id]: { ...habit, ...action.patch } } }
    }

    case 'DELETE_HABIT': {
      if (!state.habits[action.id]) return state
      const habits = { ...state.habits }
      const completions = { ...state.completions }
      delete habits[action.id]
      delete completions[action.id]
      return { ...state, habits, completions, order: state.order.filter((id) => id !== action.id) }
    }

    case 'TOGGLE_COMPLETION': {
      if (!state.habits[action.id]) return state
      const current = state.completions[action.id] ?? {}
      const next = { ...current }
      if (next[action.date]) delete next[action.date]
      else next[action.date] = true
      return { ...state, completions: { ...state.completions, [action.id]: next } }
    }

    case 'HYDRATE':
      return action.state

    case 'RESET':
      return createInitialState()

    default:
      return state
  }
}
