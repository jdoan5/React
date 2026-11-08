import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Card } from '../types'

const PRIORITY_LABEL: Record<Card['priority'], string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

interface Props {
  card: Card
  dragging: boolean
}

export function CardTile({ card, dragging }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  })

  return (
    <article
      ref={setNodeRef}
      className={`card card--${card.priority}${isDragging || dragging ? ' card--dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      <div className="card__head">
        <h3 className="card__title">{card.title}</h3>
        <span className={`chip chip--${card.priority}`}>{PRIORITY_LABEL[card.priority]}</span>
      </div>
      {card.description ? <p className="card__desc">{card.description}</p> : null}
      {/* The order key is on screen on purpose: watching it change on every drag
          is the clearest demonstration of what fractional indexing actually does. */}
      <code className="card__key" title="Fractional order key — the only field a move writes">
        {card.orderKey}
      </code>
    </article>
  )
}
