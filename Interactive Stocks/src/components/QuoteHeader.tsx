import type { Quote } from '../types'
import { formatPct, formatPrice, formatSigned } from '../lib/format'

interface Props {
  quote: Quote
  starred: boolean
  onToggleStar: () => void
}

export function QuoteHeader({ quote, starred, onToggleStar }: Props) {
  const up = quote.change >= 0
  return (
    <div className="quote">
      <div className="quote__id">
        <div className="quote__symbol-row">
          <h2 className="quote__symbol">{quote.symbol}</h2>
          <button
            className={`star${starred ? ' is-on' : ''}`}
            onClick={onToggleStar}
            aria-label={starred ? 'Remove from watchlist' : 'Add to watchlist'}
            title={starred ? 'Remove from watchlist' : 'Add to watchlist'}
          >
            {starred ? '★' : '☆'}
          </button>
        </div>
        {quote.name && <p className="quote__name">{quote.name}</p>}
      </div>

      <div className="quote__price">
        <span className="quote__value">{formatPrice(quote.price)}</span>
        <span className={`quote__change ${up ? 'up' : 'down'}`}>
          {up ? '▲' : '▼'} {formatSigned(quote.change)} ({formatPct(quote.changePct)})
        </span>
      </div>
    </div>
  )
}
