import { useEffect, useState } from 'react'
import type { Habit, Weekday } from '../types'
import { useHabits } from '../hooks/useHabits'
import { DAILY, HABIT_COLORS, HABIT_EMOJIS, WEEKDAY_LABELS, WEEKDAYS, WEEKENDS } from '../constants'
import { toggleWeekday } from '../utils/schedule'

interface Props {
  /** null = create a new habit; a habit = edit it. */
  habit: Habit | null
  onClose: () => void
}

export function HabitForm({ habit, onClose }: Props) {
  const { addHabit, updateHabit } = useHabits()
  const [name, setName] = useState(habit?.name ?? '')
  const [emoji, setEmoji] = useState(habit?.emoji ?? HABIT_EMOJIS[0])
  const [color, setColor] = useState(habit?.color ?? HABIT_COLORS[0])
  const [schedule, setSchedule] = useState<Weekday[]>(habit?.schedule ?? DAILY)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function save() {
    const trimmed = name.trim()
    if (!trimmed) return
    if (habit) updateHabit(habit.id, { name: trimmed, emoji, color, schedule })
    else addHabit(trimmed, emoji, color, schedule)
    onClose()
  }

  const isPreset = (preset: Weekday[]) =>
    schedule.length === preset.length && preset.every((d) => schedule.includes(d))

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={habit ? 'Edit habit' : 'New habit'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__head">
          <h2>{habit ? 'Edit habit' : 'New habit'}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="picker-row">
          <span className="big-emoji" aria-hidden>
            {emoji}
          </span>
          <input
            className="modal__name"
            value={name}
            placeholder="Habit name (e.g. Drink water)"
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
            }}
          />
        </div>

        <div className="field">
          <span className="field__label">Icon</span>
          <div className="emoji-grid">
            {HABIT_EMOJIS.map((option) => (
              <button
                key={option}
                className={`emoji-opt${option === emoji ? ' is-active' : ''}`}
                onClick={() => setEmoji(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field__label">Color</span>
          <div className="swatches">
            {HABIT_COLORS.map((option) => (
              <button
                key={option}
                className={`swatch${option === color ? ' is-active' : ''}`}
                style={{ background: option }}
                aria-label={`Choose colour ${option}`}
                onClick={() => setColor(option)}
              />
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field__label">Schedule</span>
          <div className="presets">
            <button className={`chip${isPreset(DAILY) ? ' is-active' : ''}`} onClick={() => setSchedule(DAILY)}>
              Every day
            </button>
            <button className={`chip${isPreset(WEEKDAYS) ? ' is-active' : ''}`} onClick={() => setSchedule(WEEKDAYS)}>
              Weekdays
            </button>
            <button className={`chip${isPreset(WEEKENDS) ? ' is-active' : ''}`} onClick={() => setSchedule(WEEKENDS)}>
              Weekends
            </button>
          </div>
          <div className="weekday-row">
            {WEEKDAY_LABELS.map((label, i) => (
              <button
                key={i}
                className={`weekday${schedule.includes(i as Weekday) ? ' is-active' : ''}`}
                onClick={() => setSchedule((s) => toggleWeekday(s, i as Weekday))}
                aria-pressed={schedule.includes(i as Weekday)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="modal__actions">
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={save} disabled={!name.trim()}>
            {habit ? 'Save changes' : 'Create habit'}
          </button>
        </div>
      </div>
    </div>
  )
}
