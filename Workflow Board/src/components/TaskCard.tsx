import { memo } from 'react'
import type { HTMLAttributes } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ID, Label, Task, User } from '../types'
import { TaskCardView } from './TaskCardView'

interface Props {
  task: Task
  users: Record<ID, User>
  labels: Record<ID, Label>
  onOpen: (taskId: ID) => void
}

/**
 * Sortable wrapper around TaskCardView. Memoised so that, thanks to the
 * normalised immutable state, a card only re-renders when its own task (or the
 * shared user/label maps) actually change.
 */
function TaskCardImpl({ task, users, labels, onOpen }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task' },
  })

  const assignee = task.assigneeId ? users[task.assigneeId] : undefined
  const resolvedLabels = task.labelIds.map((id) => labels[id]).filter(Boolean)

  return (
    <TaskCardView
      task={task}
      assignee={assignee}
      labels={resolvedLabels}
      innerRef={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : undefined,
      }}
      handleProps={{ ...attributes, ...listeners } as HTMLAttributes<HTMLElement>}
      onOpen={() => onOpen(task.id)}
      dragging={isDragging}
    />
  )
}

export const TaskCard = memo(TaskCardImpl)
