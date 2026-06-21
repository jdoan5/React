import { useState } from 'react'
import { DEFAULT_SYMBOL } from './constants'
import type { RangeKey } from './types'
import { useQuote } from './hooks/useQuote'
import { useBars } from './hooks/useBars'
import { useWatchlist } from './hooks/useWatchlist'
import { SearchBar } from './components/SearchBar'
import { QuoteHeader } from './components/QuoteHeader'
import { RangeTabs } from './components/RangeTabs'
import { PriceChart } from './components/PriceChart'
import { StatGrid } from './components/StatGrid'
import { Watchlist } from './components/Watchlist'
import { DemoBadge } from './components/DemoBadge'

export default function App() {
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL)
  const [range, setRange] = useState<RangeKey>('1M')

  const { quote, isMock: quoteMock } = useQuote(symbol)
  const { bars, loading: barsLoading, isMock: barsMock } = useBars(symbol, range)
  const { symbols, has, toggle, remove } = useWatchlist()
  const isMock = quoteMock || barsMock

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden>📈</span>
          <h1>Interactive Stocks</h1>
        </div>
        <SearchBar onSelect={setSymbol} />
        {isMock && <DemoBadge />}
      </header>

      <main className="layout">
        <section className="panel main-panel">
          {quote ? (
            <>
              <QuoteHeader quote={quote} starred={has(symbol)} onToggleStar={() => toggle(symbol)} />
              <div className="chart-head">
                <RangeTabs value={range} onChange={setRange} />
              </div>
              {barsLoading && bars.length === 0 ? (
                <div className="chart chart--empty">Loading…</div>
              ) : (
                <PriceChart bars={bars} />
              )}
              <StatGrid quote={quote} />
            </>
          ) : (
            <div className="chart chart--empty">Loading…</div>
          )}
        </section>

        <Watchlist symbols={symbols} active={symbol} onSelect={setSymbol} onRemove={remove} />
      </main>

      <footer className="foot">
        Data via{' '}
        <a href="https://massive.com" target="_blank" rel="noreferrer">
          massive.com
        </a>
        . {isMock ? 'Showing demo data — set MASSIVE_API_KEY for live prices.' : 'Live market data.'} For education,
        not investment advice.
      </footer>
    </div>
  )
}
