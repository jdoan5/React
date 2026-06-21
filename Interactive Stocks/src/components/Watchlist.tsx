import { useMemo } from 'react'
import { useQuote } from '../hooks/useQuote'
import { changeOf, closes } from '../lib/transform'
import { mockBars } from '../lib/mock'
import { formatPct, formatPrice } from '../lib/format'
import { DOWN, UP } from '../constants'
import { Sparkline } from './Sparkline'

interface RowProps {
  symbol: string
  active: boolean
  onSelect: (s: string) => void
  onRemove: (s: string) => void
}

function WatchlistRow({ symbol, active, onSelect, onRemove }: RowProps) {
  const { quote } = useQuote(symbol)
  // Decorative sparkline from deterministic demo data (keeps API calls to one per row).
  const spark = useMemo(() => closes(mockBars(symbol, '1M')), [symbol])
  const sparkUp = useMemo(() => changeOf(spark).change >= 0, [spark])
  const priceUp = (quote?.change ?? 0) >= 0

  return (
    <li className={`wl-row${active ? ' is-active' : ''}`}>
      <button className="wl-row__main" onClick={() => onSelect(symbol)}>
        <span className="wl-row__sym">{symbol}</span>
        <Sparkline values={spark} color={sparkUp ? UP : DOWN} />
        <span className="wl-row__price">
          <span>{quote ? formatPrice(quote.price) : '—'}</span>
          <span className={priceUp ? 'up' : 'down'}>{quote ? formatPct(quote.changePct) : ''}</span>
        </span>
      </button>
      <button className="wl-row__remove" onClick={() => onRemove(symbol)} aria-label={`Remove ${symbol}`}>
        ✕
      </button>
    </li>
  )
}

interface Props {
  symbols: string[]
  active: string
  onSelect: (s: string) => void
  onRemove: (s: string) => void
}

export function Watchlist({ symbols, active, onSelect, onRemove }: Props) {
  return (
    <aside className="watchlist">
      <h2 className="watchlist__title">Watchlist</h2>
      {symbols.length === 0 && <p className="watchlist__empty">Star a stock to track it here.</p>}
      <ul className="watchlist__list">
        {symbols.map((s) => (
          <WatchlistRow key={s} symbol={s} active={s === active} onSelect={onSelect} onRemove={onRemove} />
        ))}
      </ul>
    </aside>
  )
}
