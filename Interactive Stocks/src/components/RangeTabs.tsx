import type { RangeKey } from '../types'
import { RANGES } from '../constants'

interface Props {
  value: RangeKey
  onChange: (range: RangeKey) => void
}

export function RangeTabs({ value, onChange }: Props) {
  return (
    <div className="ranges" role="tablist" aria-label="Chart range">
      {RANGES.map((r) => (
        <button
          key={r.key}
          role="tab"
          aria-selected={value === r.key}
          className={`range${value === r.key ? ' is-active' : ''}`}
          onClick={() => onChange(r.key)}
        >
          {r.label}
        </button>
      ))}
    </div>
  )
}
