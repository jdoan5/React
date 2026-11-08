import { useDroppable } from '@dnd-kit/core'
import type { ReactNode } from 'react'
import type { Column } from '../types'

interface Props {
  column: Column
  count: number
  children: ReactNode
}

/**
 * A column is a drop target in its own right, not just a container of sortable
 * cards — otherwise dropping into an empty column has nothing to collide with.
 */
export function BoardColumn({ column, count, children }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })

  return (
    <section className={`column${isOver ? ' column--over' : ''}`} ref={setNodeRef}>
      <header className="column__head">
        <h2 className="column__title">{column.title}</h2>
        <span className="column__count">{count}</span>
      </header>
      <div className="column__cards">
        {children}
        {count === 0 ? <p className="column__empty">Drop a card here</p> : null}
      </div>
    </section>
  )
}
