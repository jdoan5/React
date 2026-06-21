import { useState, type MouseEvent } from 'react'
import type { Bar } from '../types'
import { buildChart, changeOf, closes } from '../lib/transform'
import { formatDate, formatPrice } from '../lib/format'
import { DOWN, UP } from '../constants'

const W = 760
const H = 260

interface Props {
  bars: Bar[]
}

/** Hand-built SVG area chart with a hover crosshair + tooltip. */
export function PriceChart({ bars }: Props) {
  const [hover, setHover] = useState<number | null>(null)
  const values = closes(bars)

  if (values.length < 2) return <div className="chart chart--empty">Not enough data to chart.</div>

  const geom = buildChart(values, W, H)
  const up = changeOf(values).change >= 0
  const color = up ? UP : DOWN
  const gradId = up ? 'grad-up' : 'grad-down'

  function onMove(e: MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.round((x / W) * (values.length - 1))
    setHover(Math.max(0, Math.min(values.length - 1, i)))
  }

  const point = hover !== null ? geom.points[hover] : null
  const bar = hover !== null ? bars[hover] : null

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="chart__svg"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={geom.area} fill={`url(#${gradId})`} />
        <path d={geom.line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      </svg>
      {/* Crosshair + dot are HTML overlays so the non-uniform SVG stretch doesn't distort them. */}
      {point && <div className="chart__crosshair" style={{ left: `${(point.x / W) * 100}%` }} />}
      {point && (
        <div
          className="chart__dot"
          style={{ left: `${(point.x / W) * 100}%`, top: `${(point.y / H) * 100}%`, background: color }}
        />
      )}
      {point && bar && (
        <div className="chart__tip" style={{ left: `${(point.x / W) * 100}%` }}>
          <strong>{formatPrice(bar.c)}</strong>
          <span>{formatDate(bar.t)}</span>
        </div>
      )}
    </div>
  )
}
