import type { UnitSystem } from '../types'

interface Props {
  value: UnitSystem
  onChange: (unit: UnitSystem) => void
}

const OPTIONS: { id: UnitSystem; label: string; hint: string }[] = [
  { id: 'metric', label: 'Metric', hint: 'cm / kg' },
  { id: 'imperial', label: 'Imperial', hint: 'ft·in / lb' },
]

export function UnitToggle({ value, onChange }: Props) {
  return (
    <div className="unit-toggle" role="radiogroup" aria-label="Unit system">
      {OPTIONS.map((o) => (
        <button
          key={o.id}
          role="radio"
          aria-checked={value === o.id}
          className={`unit-toggle__btn${value === o.id ? ' is-active' : ''}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
          <span className="unit-toggle__hint">{o.hint}</span>
        </button>
      ))}
    </div>
  )
}
