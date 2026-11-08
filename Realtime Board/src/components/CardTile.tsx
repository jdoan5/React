import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { PRIORITY_META } from '../constants'
import type { ProjectedCard } from '../lib/project'

interface Props {
  card: ProjectedCard
  dragging: boolean
}

export function CardTile({ card, dragging }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  })
  const meta = PRIORITY_META[card.priority]

  return (
    <article
      ref={setNodeRef}
      className={`card card--${card.priority}${isDragging || dragging ? ' card--dragging' : ''}${
        card.pending ? ' card--pending' : ''
      }`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      <div className="card__head">
        <h3 className="card__title">{card.title}</h3>
        <span className={`chip chip--${card.priority}`}>{meta.label}</span>
      </div>
      {card.description ? <p className="card__desc">{card.description}</p> : null}
      <div className="card__foot">
        {/* On screen on purpose: watching this change on every drag is the
            clearest demonstration of what a fractional index actually does. */}
        <code className="card__key" title="Fractional order key — the only field a move writes">
          {card.order_key}
        </code>
        {card.pending ? (
          <span className="card__pending" title="Not yet confirmed by the server">
            saving…
          </span>
        ) : null}
      </div>
    </article>
  )
}
