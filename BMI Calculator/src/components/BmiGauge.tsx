import { CATEGORIES, GAUGE } from '../constants'

const W = 600
const H = 62
const BAR_Y = 20
const BAR_H = 16

function xFor(bmi: number): number {
  const clamped = Math.max(GAUGE.min, Math.min(GAUGE.max, bmi))
  return ((clamped - GAUGE.min) / (GAUGE.max - GAUGE.min)) * W
}

interface Props {
  bmi: number | null
}

/** Hand-built SVG scale: WHO bands across BMI 15–40 with a marker at your value. */
export function BmiGauge({ bmi }: Props) {
  const segments = CATEGORIES.map((c) => {
    const from = Math.max(c.min, GAUGE.min)
    const to = Math.min(c.max, GAUGE.max)
    return { id: c.id, color: c.color, x: xFor(from), width: xFor(to) - xFor(from) }
  }).filter((s) => s.width > 0)

  const ticks = [18.5, 25, 30, 35]

  return (
    <svg
      className="gauge"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={
        bmi ? `BMI ${bmi.toFixed(1)} on a scale from ${GAUGE.min} to ${GAUGE.max}` : 'BMI scale'
      }
    >
      <defs>
        <clipPath id="gauge-clip">
          <rect x="0" y={BAR_Y} width={W} height={BAR_H} rx={BAR_H / 2} />
        </clipPath>
      </defs>

      <g clipPath="url(#gauge-clip)">
        {segments.map((s) => (
          <rect key={s.id} x={s.x} y={BAR_Y} width={s.width} height={BAR_H} fill={s.color} />
        ))}
        {ticks.map((t) => (
          <line
            key={`d-${t}`}
            x1={xFor(t)}
            y1={BAR_Y}
            x2={xFor(t)}
            y2={BAR_Y + BAR_H}
            className="gauge__divider"
          />
        ))}
      </g>

      {ticks.map((t) => (
        <text key={`t-${t}`} x={xFor(t)} y={BAR_Y + BAR_H + 16} className="gauge__tick">
          {t}
        </text>
      ))}

      {bmi !== null && (
        <g className="gauge__marker" style={{ transform: `translateX(${xFor(bmi)}px)` }}>
          <polygon points="0,16 -6,6 6,6" />
          <line x1="0" y1={BAR_Y - 2} x2="0" y2={BAR_Y + BAR_H + 2} />
        </g>
      )}
    </svg>
  )
}
