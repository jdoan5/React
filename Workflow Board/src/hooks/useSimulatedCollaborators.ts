import { useEffect, useRef } from 'react'
import { useBoardContext } from '../state/BoardContext'
import type { BoardState } from '../types'

const NEW_TASK_TITLES = [
  'Investigate flaky CI run',
  'Sync with design on spacing',
  'Add empty-state illustration',
  'Refactor board selectors',
  'Write release notes',
  'Triage incoming bug reports',
  'Spike: offline support',
  'Update dependency versions',
]

function pick<T>(arr: T[]): T | undefined {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined
}

/**
 * The "multiplayer" illusion: on an interval, a randomly chosen teammate (never
 * you) performs a realistic action — moving a card, picking up work, adding an
 * idea, or going online/offline. Everything routes through the same reducer, so
 * it animates on the board and shows up in the activity feed just like your own
 * actions. A `ref` holds the latest state so the interval never goes stale.
 */
export function useSimulatedCollaborators(enabled: boolean, intervalMs = 2600) {
  const { state, dispatch } = useBoardContext()
  const stateRef = useRef<BoardState>(state)
  stateRef.current = state

  useEffect(() => {
    if (!enabled) return

    const timer = window.setInterval(() => {
      const s = stateRef.current
      const others = Object.values(s.users).filter((u) => u.id !== s.currentUserId)
      const actor = pick(others)
      if (!actor) return

      if (!actor.online) dispatch({ type: 'SET_PRESENCE', userId: actor.id, online: true })

      const roll = Math.random()
      const taskIds = Object.keys(s.tasks)

      if (roll < 0.6 && taskIds.length) {
        // Move a card to a (possibly different) column.
        const taskId = pick(taskIds)!
        const task = s.tasks[taskId]
        const toColumnId = pick(s.columnOrder)!
        const column = s.columns[toColumnId]
        const toIndex = Math.floor(Math.random() * (column.taskIds.length + 1))
        dispatch({ type: 'MOVE_TASK', taskId, toColumnId, toIndex })
        dispatch({ type: 'LOG', userId: actor.id, message: `moved “${task.title}” to ${column.title}` })
      } else if (roll < 0.78 && taskIds.length) {
        // Pick up a task by assigning it to someone.
        const taskId = pick(taskIds)!
        const assignee = pick(Object.keys(s.users))!
        dispatch({ type: 'UPDATE_TASK', taskId, patch: { assigneeId: assignee }, actorId: actor.id })
      } else if (roll < 0.9) {
        // Add a fresh idea to a random column.
        const toColumnId = pick(s.columnOrder)!
        dispatch({ type: 'ADD_TASK', columnId: toColumnId, title: pick(NEW_TASK_TITLES)!, actorId: actor.id })
      } else {
        // Someone toggles their presence.
        const someone = pick(others)!
        dispatch({ type: 'SET_PRESENCE', userId: someone.id, online: !someone.online })
      }
    }, intervalMs)

    return () => window.clearInterval(timer)
  }, [enabled, intervalMs, dispatch])
}
