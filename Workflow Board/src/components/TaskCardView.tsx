import type { CSSProperties, HTMLAttributes } from 'react'
import type { Label, Task, User } from '../types'
import { PRIORITY_META } from '../constants'
import { formatDueDate, isOverdue } from '../utils/format'
import { Avatar } from './Avatar'

interface Props {
  task: Task
  assignee?: User
  labels: Label[]
  innerRef?: (node: HTMLElement | null) => void
  style?: CSSProperties
  /** Drag attributes + listeners from useSortable. */
  handleProps?: HTMLAttributes<HTMLElement>
  onOpen?: () => void
  dragging?: boolean
  overlay?: boolean
}

/**
 * Presentational card. Kept free of drag hooks so it can be reused both as a
 * sortable item (see TaskCard) and inside the DragOverlay.
 */
export function TaskCardView({
  task,
  assignee,
  labels,
  innerRef,
  style,
  handleProps,
  onOpen,
  dragging = false,
  overlay = false,
}: Props) {
  const priority = PRIORITY_META[task.priority]
  const overdue = task.dueDate ? isOverdue(task.dueDate) : false

  return (
    <article
      ref={innerRef}
      style={style}
      className={`card${dragging ? ' is-dragging' : ''}${overlay ? ' is-overlay' : ''}`}
      onClick={onOpen}
      {...handleProps}
    >
      {labels.length > 0 && (
        <div className="card__labels">
          {labels.map((label) => (
            <span key={label.id} className="card__label" style={{ background: label.color }}>
              {label.name}
            </span>
          ))}
        </div>
      )}

      <p className="card__title">{task.title}</p>

      <div className="card__footer">
        <span className="card__priority" title={`${priority.label} priority`}>
          <span className="dot" style={{ background: priority.color }} />
          {priority.label}
        </span>

        <span className="card__spacer" />

        {task.dueDate && (
          <span className={`card__due${overdue ? ' is-overdue' : ''}`} title={overdue ? 'Overdue' : 'Due date'}>
            🗓 {formatDueDate(task.dueDate)}
          </span>
        )}

        {assignee && <Avatar user={assignee} size={24} />}
      </div>
    </article>
  )
}
