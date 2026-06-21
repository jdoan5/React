import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useTickerSearch } from '../hooks/useTickerSearch'

interface Props {
  onSelect: (symbol: string) => void
}

export function SearchBar({ onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const { results, loading } = useTickerSearch(query)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function choose(symbol: string) {
    onSelect(symbol.toUpperCase())
    setQuery('')
    setOpen(false)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && query.trim()) {
      choose(results[0]?.symbol ?? query.trim())
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="search" ref={ref}>
      <span className="search__icon" aria-hidden>🔍</span>
      <input
        value={query}
        placeholder="Search symbol or company…"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        aria-label="Search ticker"
      />
      {open && query.trim() && (
        <ul className="search__results">
          {results.length === 0 && !loading && <li className="search__empty">No matches</li>}
          {results.map((t) => (
            <li key={t.symbol}>
              <button onClick={() => choose(t.symbol)}>
                <strong>{t.symbol}</strong>
                <span>{t.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
