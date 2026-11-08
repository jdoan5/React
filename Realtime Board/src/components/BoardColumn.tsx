import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import { needsRebalance } from '../lib/ordering'
import type { ProjectedColumn } from '../lib/project'

interface Props {
  column: ProjectedColumn
  keys: readonly string[]
  onAddCard: (title: string) => void
  onRebalance: () => void
  children: ReactNode
}

/**
 * A column is a drop target in its own right, not just a container of sortable
 * cards — otherwise dropping into an empty column has nothing to collide with.
 */
export function BoardColumn({ column, keys, onAddCard, onRebalance, children }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })
  const [draft, setDraft] = useState('')
  const longKeys = needsRebalance(keys)

  function submit(event: React.FormEvent) {
    event.preventDefault()
    onAddCard(draft)
    setDraft('')
  }

  return (
    <section className={`column${isOver ? ' column--over' : ''}`} ref={setNodeRef}>
      <header className="column__head">
        <h2 className="column__title">{column.title}</h2>
        <span className="column__count">{column.cardIds.length}</span>
      </header>

      <div className="column__cards">
        {children}
        {column.cardIds.length === 0 ? <p className="column__empty">Drop a card here</p> : null}
      </div>

      {longKeys ? (
        <button className="column__rebalance" onClick={onRebalance} type="button">
          Keys are getting long — rebalance
        </button>
      ) : null}

      <form className="column__add" onSubmit={submit}>
        <input
          aria-label={`Add a card to ${column.title}`}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a card…"
          value={draft}
        />
      </form>
    </section>
  )
}
