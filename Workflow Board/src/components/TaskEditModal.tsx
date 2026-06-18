import { useEffect, useState } from 'react'
import type { ID, Label, Priority, Task, User } from '../types'
import { PRIORITIES, PRIORITY_META } from '../constants'
import { formatRelativeTime } from '../utils/format'
import { Avatar } from './Avatar'

type TaskPatch = Partial<Omit<Task, 'id' | 'createdAt' | 'createdBy'>>

interface Props {
  task: Task
  users: User[]
  labels: Label[]
  usersById: Record<ID, User>
  onUpdate: (taskId: ID, patch: TaskPatch) => void
  onDelete: (taskId: ID) => void
  onClose: () => void
}

function sameLabels(a: ID[], b: ID[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id))
}

export function TaskEditModal({ task, users, labels, usersById, onUpdate, onDelete, onClose }: Props) {
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [assigneeId, setAssigneeId] = useState<ID | null>(task.assigneeId)
  const [priority, setPriority] = useState<Priority>(task.priority)
  const [labelIds, setLabelIds] = useState<ID[]>(task.labelIds)
  const [dueDate, setDueDate] = useState<string | null>(task.dueDate)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function toggleLabel(id: ID) {
    setLabelIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function save() {
    const patch: TaskPatch = {}
    const trimmed = title.trim()
    if (trimmed && trimmed !== task.title) patch.title = trimmed
    if (description !== task.description) patch.description = description
    if (assigneeId !== task.assigneeId) patch.assigneeId = assigneeId
    if (priority !== task.priority) patch.priority = priority
    if (!sameLabels(labelIds, task.labelIds)) patch.labelIds = labelIds
    if (dueDate !== task.dueDate) patch.dueDate = dueDate
    if (Object.keys(patch).length > 0) onUpdate(task.id, patch)
    onClose()
  }

  const creator = usersById[task.createdBy]

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Edit card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__head">
          <input
            className="modal__title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Card title"
            autoFocus
          />
          <button className="icon-btn" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal__grid">
          <label className="field">
            <span className="field__label">Assignee</span>
            <select
              value={assigneeId ?? ''}
              onChange={(e) => setAssigneeId(e.target.value || null)}
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field__label">Priority</span>
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_META[p].label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field__label">Due date</span>
            <input
              type="date"
              value={dueDate ?? ''}
              onChange={(e) => setDueDate(e.target.value || null)}
            />
          </label>
        </div>

        <div className="field">
          <span className="field__label">Labels</span>
          <div className="label-picker">
            {labels.map((label) => {
              const active = labelIds.includes(label.id)
              return (
                <button
                  key={label.id}
                  className={`chip${active ? ' is-active' : ''}`}
                  style={active ? { background: label.color, borderColor: label.color } : { borderColor: label.color, color: label.color }}
                  onClick={() => toggleLabel(label.id)}
                >
                  {label.name}
                </button>
              )
            })}
          </div>
        </div>

        <label className="field">
          <span className="field__label">Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add more detail…"
            rows={4}
          />
        </label>

        <div className="modal__meta">
          {creator && <Avatar user={creator} size={20} />}
          <span>
            Added {creator ? `by ${creator.name} ` : ''}
            {formatRelativeTime(task.createdAt)}
          </span>
        </div>

        <div className="modal__actions">
          <button className="btn btn--danger" onClick={() => onDelete(task.id)}>
            Delete
          </button>
          <span className="card__spacer" />
          <button className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn--primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
