import { buildChart } from '../lib/transform'

interface Props {
  values: number[]
  color: string
  width?: number
  height?: number
}

export function Sparkline({ values, color, width = 72, height = 28 }: Props) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden />
  const { line } = buildChart(values, width, height)
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="spark" aria-hidden>
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}
