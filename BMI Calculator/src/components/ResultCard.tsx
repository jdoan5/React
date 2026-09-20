import type { CSSProperties } from 'react'
import type { BmiResult, UnitSystem } from '../types'
import { formatBmi, formatWeight } from '../lib/format'
import { BmiGauge } from './BmiGauge'

interface Props {
  result: BmiResult | null
  unit: UnitSystem
}

export function ResultCard({ result, unit }: Props) {
  if (!result) {
    return (
      <section className="result result--empty">
        <BmiGauge bmi={null} />
        <p className="result__hint">Enter your height and weight to see your BMI.</p>
      </section>
    )
  }

  const { bmi, category, prime, healthyRange, deltaKg } = result
  const style = { '--accent': category.color } as CSSProperties

  const delta =
    deltaKg === 0
      ? 'You are within the healthy range.'
      : deltaKg > 0
        ? `${formatWeight(deltaKg, unit)} above the healthy range.`
        : `${formatWeight(Math.abs(deltaKg), unit)} below the healthy range.`

  return (
    <section className="result" style={style}>
      <div className="result__head">
        <div>
          <p className="result__label">Your BMI</p>
          <p className="result__value">{formatBmi(bmi)}</p>
        </div>
        <span className="pill">{category.label}</span>
      </div>

      <BmiGauge bmi={bmi} />

      <p className="result__delta">{delta}</p>

      <dl className="stats">
        <div className="stat">
          <dt>Healthy range</dt>
          <dd>
            {formatWeight(healthyRange.minKg, unit)} – {formatWeight(healthyRange.maxKg, unit)}
          </dd>
        </div>
        <div className="stat">
          <dt>BMI Prime</dt>
          <dd>{prime.toFixed(2)}</dd>
        </div>
      </dl>
    </section>
  )
}
