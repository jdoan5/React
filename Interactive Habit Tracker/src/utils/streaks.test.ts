import { describe, it, expect } from 'vitest'
import type { Habit } from '../types'
import { completionRate, currentStreak, isDue, longestStreak, overallToday } from './streaks'

// 2024-06-19 is a Wednesday. Weekday math is timezone-stable because dates are
// built from local calendar components.
const TODAY = '2024-06-19'

function habit(partial: Partial<Habit> = {}): Habit {
  return {
    id: 'h',
    name: 'Habit',
    emoji: '✅',
    color: '#000',
    schedule: [0, 1, 2, 3, 4, 5, 6],
    createdAt: '2024-06-01',
    archived: false,
    ...partial,
  }
}

function set(dates: string[]): Record<string, true> {
  return Object.fromEntries(dates.map((d) => [d, true]))
}

describe('isDue', () => {
  const weekday = habit({ schedule: [1, 2, 3, 4, 5] })
  it('is false on the weekend for a weekday habit', () => {
    expect(isDue(weekday, '2024-06-15')).toBe(false) // Saturday
    expect(isDue(weekday, '2024-06-16')).toBe(false) // Sunday
  })
  it('is true on a scheduled weekday', () => {
    expect(isDue(weekday, '2024-06-17')).toBe(true) // Monday
  })
})

describe('currentStreak', () => {
  it('counts consecutive completed days (today still open → grace)', () => {
    const c = set(['2024-06-15', '2024-06-16', '2024-06-17', '2024-06-18'])
    expect(currentStreak(habit(), c, TODAY)).toBe(4)
  })

  it('counts today when it is already done', () => {
    const c = set(['2024-06-16', '2024-06-17', '2024-06-18', '2024-06-19'])
    expect(currentStreak(habit(), c, TODAY)).toBe(4)
  })

  it('breaks on a missed due day', () => {
    const c = set(['2024-06-15', '2024-06-16', '2024-06-18']) // 17 missing
    expect(currentStreak(habit(), c, TODAY)).toBe(1)
  })

  it('skips non-due days without breaking (weekday habit over a weekend)', () => {
    const h = habit({ schedule: [1, 2, 3, 4, 5], createdAt: '2024-06-03' })
    const c = set(['2024-06-14', '2024-06-17', '2024-06-18']) // Fri, Mon, Tue
    expect(currentStreak(h, c, TODAY)).toBe(3)
  })

  it('is zero with no completions', () => {
    expect(currentStreak(habit(), {}, TODAY)).toBe(0)
  })
})

describe('longestStreak', () => {
  it('returns the best historical run', () => {
    const c = set([
      '2024-06-03', '2024-06-04', '2024-06-05', // run of 3
      '2024-06-15', '2024-06-16', '2024-06-17', '2024-06-18', // run of 4
    ])
    expect(longestStreak(habit(), c, TODAY)).toBe(4)
  })
})

describe('completionRate', () => {
  it('computes done/total of due days in the window', () => {
    const c = set(['2024-06-15', '2024-06-16', '2024-06-17', '2024-06-18'])
    const r = completionRate(habit(), c, '2024-06-13', '2024-06-19')
    expect(r.done).toBe(4)
    expect(r.total).toBe(7)
    expect(r.pct).toBeCloseTo(4 / 7)
  })

  it('ignores days before the habit existed', () => {
    const h = habit({ createdAt: '2024-06-17' })
    const r = completionRate(h, set(['2024-06-17', '2024-06-18']), '2024-06-10', '2024-06-19')
    expect(r.total).toBe(3) // 17, 18, 19
    expect(r.done).toBe(2)
  })
})

describe('overallToday', () => {
  it('aggregates due habits for today', () => {
    const a = habit({ id: 'a' })
    const b = habit({ id: 'b', schedule: [1, 2, 3, 4, 5] }) // due Wed
    const r = overallToday([a, b], { a: set(['2024-06-19']), b: set([]) }, TODAY)
    expect(r).toEqual({ done: 1, total: 2, pct: 0.5 })
  })

  it('excludes archived and not-due habits', () => {
    const a = habit({ id: 'a', archived: true })
    const b = habit({ id: 'b', schedule: [0] }) // Sundays only → not due Wed
    const r = overallToday([a, b], { a: set([]), b: set([]) }, TODAY)
    expect(r.total).toBe(0)
    expect(r.pct).toBe(0)
  })
})
