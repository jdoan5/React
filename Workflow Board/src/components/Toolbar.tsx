import { useEffect, useMemo, useRef } from 'react'
import { useBoard } from '../hooks/useBoard'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useTasks } from '../hooks/useTasks'
import type { ID } from '../types'
import { Avatar } from './Avatar'

interface Props {
  search: string
  onSearch: (value: string) => void
  assigneeId: ID | null
  onAssignee: (id: ID | null) => void
  labelId: ID | null
  onLabel: (id: ID | null) => void
  filtersActive: boolean
  onResetFilters: () => void
  simEnabled: boolean
  onToggleSim: () => void
  activityOpen: boolean
  onToggleActivity: () => void
}

export function Toolbar({
  search,
  onSearch,
  assigneeId,
  onAssignee,
  labelId,
  onLabel,
  filtersActive,
  onResetFilters,
  simEnabled,
  onToggleSim,
  activityOpen,
  onToggleActivity,
}: Props) {
  const { state, resetBoard } = useBoard()
  const { currentUser, users, onlineUsers, switchUser } = useCurrentUser()
  const { stats } = useTasks()
  const labels = useMemo(() => Object.values(state.labels), [state.labels])
  const searchRef = useRef<HTMLInputElement>(null)

  // "/" focuses search from anywhere (unless already typing in a field).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT'
      if (e.key === '/' && !typing) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function onReset() {
    if (window.confirm('Reset the board to its original demo state? This clears your changes.')) {
      resetBoard()
    }
  }

  return (
    <header className="toolbar">
      <div className="toolbar__row">
        <div className="brand">
          <span className="brand__mark">▦</span>
          <div>
            <h1 className="brand__title">Workflow Board</h1>
            <p className="brand__stats">
              {stats.total} cards
              {stats.overdue > 0 && <span className="stat-warn"> · {stats.overdue} overdue</span>}
              {stats.unassigned > 0 && <span> · {stats.unassigned} unassigned</span>}
            </p>
          </div>
        </div>

        <div className="toolbar__spacer" />

        <div className="presence" title={`${onlineUsers.length} online`}>
          {onlineUsers.map((u) => (
            <Avatar key={u.id} user={u} size={30} showStatus />
          ))}
        </div>

        <label className="acting-as" title="Switch the identity you're acting as">
          <Avatar user={currentUser} size={30} showStatus />
          <span className="acting-as__text">
            <span className="acting-as__caption">Acting as</span>
            <select value={currentUser.id} onChange={(e) => switchUser(e.target.value)}>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </span>
        </label>

        <button
          className={`btn btn--toggle${simEnabled ? ' is-on' : ''}`}
          onClick={onToggleSim}
          title="Simulate teammates acting on the board in real time"
        >
          <span className={`live-dot${simEnabled ? ' is-live' : ''}`} />
          {simEnabled ? 'Live' : 'Simulate'}
        </button>

        <button
          className={`btn btn--ghost${activityOpen ? ' is-on' : ''}`}
          onClick={onToggleActivity}
          aria-pressed={activityOpen}
        >
          Activity
        </button>

        <button className="btn btn--ghost" onClick={onReset}>
          Reset
        </button>
      </div>

      <div className="toolbar__row toolbar__filters">
        <div className="search">
          <span className="search__icon">🔍</span>
          <input
            ref={searchRef}
            value={search}
            placeholder="Search cards…  ( / )"
            onChange={(e) => onSearch(e.target.value)}
          />
        </div>

        <select
          className="filter-select"
          value={assigneeId ?? ''}
          onChange={(e) => onAssignee(e.target.value || null)}
        >
          <option value="">All assignees</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>

        <select
          className="filter-select"
          value={labelId ?? ''}
          onChange={(e) => onLabel(e.target.value || null)}
        >
          <option value="">All labels</option>
          {labels.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>

        {filtersActive && (
          <button className="btn btn--ghost btn--sm" onClick={onResetFilters}>
            Clear filters
          </button>
        )}
      </div>
    </header>
  )
}
