import { CATEGORIES } from '../constants'
import type { HistoryEntry, UnitSystem } from '../types'
import { formatBmi, formatDate, formatHeight, formatWeight } from '../lib/format'

interface Props {
  entries: HistoryEntry[]
  unit: UnitSystem
  onRemove: (id: string) => void
  onClear: () => void
}

export function HistoryList({ entries, unit, onRemove, onClear }: Props) {
  if (entries.length === 0) {
    return (
      <section className="history">
        <h2 className="history__title">History</h2>
        <p className="history__empty">Saved readings will appear here.</p>
      </section>
    )
  }

  return (
    <section className="history">
      <div className="history__head">
        <h2 className="history__title">History</h2>
        <button className="btn btn--ghost btn--sm" onClick={onClear}>
          Clear all
        </button>
      </div>
      <ul className="history__list">
        {entries.map((e) => {
          const category = CATEGORIES.find((c) => c.id === e.categoryId)
          return (
            <li key={e.id} className="history__item">
              <span className="history__dot" style={{ background: category?.color }} aria-hidden />
              <span className="history__bmi">{formatBmi(e.bmi)}</span>
              <span className="history__meta">
                {formatHeight(e.heightCm, unit)} · {formatWeight(e.weightKg, unit)}
              </span>
              <time className="history__time">{formatDate(e.at)}</time>
              <button
                className="history__remove"
                onClick={() => onRemove(e.id)}
                aria-label={`Remove reading from ${formatDate(e.at)}`}
              >
                ✕
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
