import { memo, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Column as ColumnModel, ID, Label, Task, User } from '../types'
import { filtersActive, taskMatchesFilters, type Filters } from '../utils/filter'
import { TaskCard } from './TaskCard'
import { AddCard } from './AddCard'

interface Props {
  column: ColumnModel
  tasks: Record<ID, Task>
  users: Record<ID, User>
  labels: Record<ID, Label>
  filters: Filters
  onOpenTask: (taskId: ID) => void
  onAddTask: (columnId: ID, title: string) => void
  onRename: (columnId: ID, title: string) => void
  onDelete: (columnId: ID) => void
  onSetWip: (columnId: ID, limit: number | null) => void
}

function ColumnImpl({
  column,
  tasks,
  users,
  labels,
  filters,
  onOpenTask,
  onAddTask,
  onRename,
  onDelete,
  onSetWip,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
    data: { type: 'column' },
  })

  const [menuOpen, setMenuOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(column.title)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      titleRef.current?.focus()
      titleRef.current?.select()
    }
  }, [editing])

  const visibleTasks = column.taskIds
    .map((id) => tasks[id])
    .filter(Boolean)
    .filter((task) => taskMatchesFilters(task, filters))
  const ids = visibleTasks.map((t) => t.id)

  const count = column.taskIds.length
  const overWip = column.wipLimit != null && count > column.wipLimit

  function commitTitle() {
    const value = draft.trim()
    if (value && value !== column.title) onRename(column.id, value)
    else setDraft(column.title)
    setEditing(false)
  }

  function onTitleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') commitTitle()
    else if (event.key === 'Escape') {
      setDraft(column.title)
      setEditing(false)
    }
  }

  function changeWip() {
    setMenuOpen(false)
    const answer = window.prompt('Set a WIP limit (leave blank for none):', column.wipLimit?.toString() ?? '')
    if (answer === null) return
    const trimmed = answer.trim()
    if (trimmed === '') return onSetWip(column.id, null)
    const n = Number.parseInt(trimmed, 10)
    if (Number.isFinite(n) && n > 0) onSetWip(column.id, n)
  }

  function removeColumn() {
    setMenuOpen(false)
    const ok = window.confirm(`Delete list “${column.title}” and its ${count} card(s)?`)
    if (ok) onDelete(column.id)
  }

  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`column${isDragging ? ' is-dragging' : ''}${overWip ? ' is-over-wip' : ''}`}
    >
      <header className="column__header">
        <button className="column__grip" aria-label="Drag list to reorder" {...attributes} {...listeners}>
          ⠿
        </button>

        {editing ? (
          <input
            ref={titleRef}
            className="column__title-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={onTitleKeyDown}
          />
        ) : (
          <h2 className="column__title" onDoubleClick={() => setEditing(true)} title="Double-click to rename">
            {column.title}
          </h2>
        )}

        <span className={`column__count${overWip ? ' is-over' : ''}`}>
          {count}
          {column.wipLimit != null ? ` / ${column.wipLimit}` : ''}
        </span>

        <div className="column__menu-wrap">
          <button className="icon-btn" aria-label="List actions" onClick={() => setMenuOpen((v) => !v)}>
            ⋯
          </button>
          {menuOpen && (
            <>
              <button className="menu-backdrop" aria-hidden onClick={() => setMenuOpen(false)} tabIndex={-1} />
              <div className="menu" role="menu">
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false)
                    setEditing(true)
                  }}
                >
                  Rename list
                </button>
                <button role="menuitem" onClick={changeWip}>
                  Set WIP limit…
                </button>
                <button role="menuitem" className="menu__danger" onClick={removeColumn}>
                  Delete list
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      <div className="column__cards">
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {visibleTasks.map((task) => (
            <TaskCard key={task.id} task={task} users={users} labels={labels} onOpen={onOpenTask} />
          ))}
        </SortableContext>

        {visibleTasks.length === 0 && (
          <p className="column__empty">{filtersActive(filters) ? 'No matching cards' : 'Drop cards here'}</p>
        )}
      </div>

      <AddCard columnId={column.id} onAdd={onAddTask} />
    </section>
  )
}

export const Column = memo(ColumnImpl)
