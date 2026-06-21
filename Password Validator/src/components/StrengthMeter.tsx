import type { StrengthLevel } from '../types'
import { STRENGTH_COLORS } from '../constants'

interface Props {
  score: StrengthLevel
  label: string
  entropyBits: number
  crackTime: string
  /** Whether there's any password to describe. */
  active: boolean
}

const SEGMENTS = [0, 1, 2, 3, 4]

export function StrengthMeter({ score, label, entropyBits, crackTime, active }: Props) {
  const color = STRENGTH_COLORS[score]

  return (
    <div className="meter">
      <div className="meter__bars">
        {SEGMENTS.map((i) => (
          <span
            key={i}
            className="meter__seg"
            style={{ background: active && i <= score ? color : undefined }}
          />
        ))}
      </div>
      <div className="meter__row">
        <span className="meter__label" style={{ color: active ? color : undefined }}>
          {active ? label : 'Awaiting input'}
        </span>
        <span className="meter__meta">{active ? `${entropyBits} bits of entropy` : ''}</span>
      </div>
      {active && (
        <p className="meter__crack">
          Time to crack: <strong>{crackTime}</strong>
        </p>
      )}
    </div>
  )
}
