import { useState, type CSSProperties } from 'react'
import type { Habit } from '../types'
import { useHabits } from '../hooks/useHabits'
import { useHabitStats } from '../hooks/useHabitStats'
import { scheduleLabel } from '../utils/schedule'
import { RATE_WINDOW_DAYS } from '../constants'
import { ProgressRing } from './ProgressRing'
import { Heatmap } from './Heatmap'

interface Props {
  habit: Habit
  onEdit: (habit: Habit) => void
}

export function HabitCard({ habit, onEdit }: Props) {
  const { toggleCompletion, setArchived, deleteHabit } = useHabits()
  const stats = useHabitStats(habit)
  const [menu, setMenu] = useState(false)
  const pct = Math.round(stats.rate.pct * 100)

  return (
    <article className="card" style={{ '--accent': habit.color } as CSSProperties}>
      <header className="card__head">
        <span className="card__emoji" aria-hidden>
          {habit.emoji}
        </span>
        <div className="card__heading">
          <h3 className="card__name">{habit.name}</h3>
          <p className="card__schedule">{scheduleLabel(habit.schedule)}</p>
        </div>
        <div className="menu-wrap">
          <button className="icon-btn" aria-label="Habit actions" onClick={() => setMenu((v) => !v)}>
            ⋯
          </button>
          {menu && (
            <>
              <button className="menu-backdrop" aria-hidden tabIndex={-1} onClick={() => setMenu(false)} />
              <div className="menu" role="menu">
                <button role="menuitem" onClick={() => { setMenu(false); onEdit(habit) }}>
                  Edit
                </button>
                <button role="menuitem" onClick={() => { setMenu(false); setArchived(habit.id, true) }}>
                  Archive
                </button>
                <button
                  role="menuitem"
                  className="menu__danger"
                  onClick={() => {
                    setMenu(false)
                    if (window.confirm(`Delete “${habit.name}” and its history?`)) deleteHabit(habit.id)
                  }}
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <div className="card__stats">
        <ProgressRing
          value={stats.rate.pct}
          color={habit.color}
          size={78}
          stroke={8}
          ariaLabel={`${pct}% completion over the last ${RATE_WINDOW_DAYS} days`}
        >
          <span className="ring__pct">
            {pct}
            <small>%</small>
          </span>
          <span className="ring__sub">{RATE_WINDOW_DAYS}d</span>
        </ProgressRing>

        <div className="streaks">
          <div className="streak">
            <span className="streak__num">🔥 {stats.currentStreak}</span>
            <span className="streak__cap">day streak</span>
          </div>
          <div className="streak">
            <span className="streak__num">🏆 {stats.longestStreak}</span>
            <span className="streak__cap">best ever</span>
          </div>
        </div>
      </div>

      <button
        className={`today-btn${stats.doneToday ? ' is-done' : ''}${!stats.dueToday ? ' is-rest' : ''}`}
        onClick={() => stats.dueToday && toggleCompletion(habit.id, stats.today)}
        disabled={!stats.dueToday}
      >
        {!stats.dueToday ? 'Rest day — nothing due' : stats.doneToday ? '✓ Done today' : 'Mark today done'}
      </button>

      <Heatmap
        habit={habit}
        completions={stats.completions}
        today={stats.today}
        onToggle={(date) => toggleCompletion(habit.id, date)}
      />
    </article>
  )
}
