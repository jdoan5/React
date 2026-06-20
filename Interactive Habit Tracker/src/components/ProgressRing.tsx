import type { ReactNode } from 'react'

interface Props {
  /** 0..1 */
  value: number
  color: string
  size?: number
  stroke?: number
  children?: ReactNode
  ariaLabel?: string
}

/** Circular progress indicator with a centred label. */
export function ProgressRing({ value, color, size = 72, stroke = 8, children, ariaLabel }: Props) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(1, value))
  const center = size / 2

  return (
    <div className="ring" style={{ width: size, height: size }} role="img" aria-label={ariaLabel}>
      <svg width={size} height={size}>
        <circle
          className="ring__track"
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
          transform={`rotate(-90 ${center} ${center})`}
          style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      </svg>
      <div className="ring__label">{children}</div>
    </div>
  )
}
