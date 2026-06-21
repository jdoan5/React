import type { Quote } from '../types'
import { formatCompact, formatPrice } from '../lib/format'

interface Props {
  quote: Quote
}

export function StatGrid({ quote }: Props) {
  const items: [string, string][] = [
    ['Open', formatPrice(quote.open)],
    ['High', formatPrice(quote.high)],
    ['Low', formatPrice(quote.low)],
    ['Prev close', formatPrice(quote.prevClose)],
    ['Volume', formatCompact(quote.volume)],
  ]
  return (
    <div className="stats">
      {items.map(([label, value]) => (
        <div className="stat" key={label}>
          <span className="stat__label">{label}</span>
          <span className="stat__value">{value}</span>
        </div>
      ))}
    </div>
  )
}
