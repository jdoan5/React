import { useOverview } from '../hooks/useOverview'
import { useHabits } from '../hooks/useHabits'
import { formatLong } from '../utils/date'
import { ProgressRing } from './ProgressRing'

interface Props {
  onAddHabit: () => void
  showArchived: boolean
  onToggleArchived: () => void
  hasArchived: boolean
}

export function Header({ onAddHabit, showArchived, onToggleArchived, hasArchived }: Props) {
  const { resetAll } = useHabits()
  const overview = useOverview()
  const pct = Math.round(overview.todayRate.pct * 100)

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <span className="logo" aria-hidden>✓</span>
        <div>
          <h1>Habit Tracker</h1>
          <p className="topbar__date">{formatLong(overview.today)}</p>
        </div>
      </div>

      <div className="topbar__summary">
        <ProgressRing
          value={overview.todayRate.pct}
          color="var(--accent)"
          size={66}
          stroke={7}
          ariaLabel={`${pct}% of today's habits complete`}
        >
          <span className="ring__pct">
            {pct}
            <small>%</small>
          </span>
        </ProgressRing>
        <div className="today-text">
          <strong>
            {overview.todayRate.done}/{overview.todayRate.total}
          </strong>
          <span className="muted">{overview.todayRate.total === 0 ? 'nothing due today' : 'done today'}</span>
        </div>

        <div className="divider" />

        <div className="stat">
          <span className="stat__num">{overview.activeCount}</span>
          <span className="stat__cap">habits</span>
        </div>
        <div className="stat">
          <span className="stat__num">🔥 {overview.bestStreak}</span>
          <span className="stat__cap">top streak</span>
        </div>
        <div className="stat">
          <span className="stat__num">{overview.totalStreak}</span>
          <span className="stat__cap">streak days</span>
        </div>
      </div>

      <div className="topbar__actions">
        {hasArchived && (
          <button className={`btn btn--ghost${showArchived ? ' is-on' : ''}`} onClick={onToggleArchived}>
            Archived
          </button>
        )}
        <button
          className="btn btn--ghost"
          onClick={() => {
            if (window.confirm('Reset all habits back to the demo data?')) resetAll()
          }}
        >
          Reset
        </button>
        <button className="btn btn--primary" onClick={onAddHabit}>
          + New habit
        </button>
      </div>
    </header>
  )
}
