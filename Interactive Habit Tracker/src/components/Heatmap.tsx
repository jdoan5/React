import type { Habit } from '../types'
import type { CompletionSet } from '../utils/streaks'
import { isDue } from '../utils/streaks'
import { addDays, formatDay, monthShort, startOfWeek, type ISODate } from '../utils/date'
import { HEATMAP_WEEKS } from '../constants'

const CELL = 13
const GAP = 3
const TOP = 16
const STEP = CELL + GAP

interface Props {
  habit: Habit
  completions: CompletionSet
  today: ISODate
  onToggle: (date: ISODate) => void
  weeks?: number
}

/**
 * GitHub-style contribution grid: one column per week, one cell per day.
 * Due-but-missed days read as empty, rest days are faintest, and completed days
 * glow in the habit's colour. Click any due day (up to today) to toggle it.
 */
export function Heatmap({ habit, completions, today, onToggle, weeks = HEATMAP_WEEKS }: Props) {
  const start = addDays(startOfWeek(today), -(weeks - 1) * 7)
  const width = weeks * STEP - GAP
  const height = TOP + 7 * STEP - GAP

  const monthLabels: { x: number; label: string }[] = []
  let lastMonth = ''
  for (let w = 0; w < weeks; w += 1) {
    const m = monthShort(addDays(start, w * 7))
    if (m !== lastMonth) {
      monthLabels.push({ x: w * STEP, label: m })
      lastMonth = m
    }
  }

  const cells = []
  for (let w = 0; w < weeks; w += 1) {
    for (let d = 0; d < 7; d += 1) {
      const iso = addDays(start, w * 7 + d)
      if (iso > today) continue
      const before = iso < habit.createdAt
      const due = isDue(habit, iso)
      const done = !!completions && completions[iso] === true

      let cls = 'heat--rest'
      if (before) cls = 'heat--before'
      else if (done) cls = 'heat--done'
      else if (due) cls = 'heat--miss'

      const clickable = due && !before
      const status = before ? 'not tracked yet' : !due ? 'rest day' : done ? 'done' : 'missed'

      cells.push(
        <rect
          key={iso}
          x={w * STEP}
          y={TOP + d * STEP}
          width={CELL}
          height={CELL}
          rx={3}
          className={`heat ${cls}${clickable ? ' is-click' : ''}`}
          style={done ? { fill: habit.color } : undefined}
          onClick={clickable ? () => onToggle(iso) : undefined}
        >
          <title>{`${formatDay(iso)} — ${status}`}</title>
        </rect>,
      )
    }
  }

  return (
    <svg
      className="heatmap"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`${habit.name} completion history`}
    >
      {monthLabels.map((m) => (
        <text key={`${m.label}-${m.x}`} x={m.x} y={11} className="heat__month">
          {m.label}
        </text>
      ))}
      {cells}
    </svg>
  )
}
