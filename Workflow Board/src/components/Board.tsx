import { useCallback, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useBoard } from '../hooks/useBoard'
import type { BoardState, ID } from '../types'
import type { Filters } from '../utils/filter'
import { Column } from './Column'
import { AddColumn } from './AddColumn'
import { TaskCardView } from './TaskCardView'
import { TaskEditModal } from './TaskEditModal'

/** Resolve the column id for any draggable id (a column id, or the column that owns a task). */
function columnIdOf(state: BoardState, id: ID): ID | undefined {
  if (state.columns[id]) return id
  return state.columnOrder.find((cid) => state.columns[cid].taskIds.includes(id))
}

interface Props {
  filters: Filters
}

export function Board({ filters }: Props) {
  const {
    state,
    addTask,
    updateTask,
    deleteTask,
    moveTask,
    moveColumn,
    addColumn,
    renameColumn,
    deleteColumn,
    setWipLimit,
    log,
  } = useBoard()

  const [activeTaskId, setActiveTaskId] = useState<ID | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<ID | null>(null)
  const dragOriginColumn = useRef<ID | null>(null)

  // Latest state for use inside drag handlers (avoids stale closures).
  const stateRef = useRef<BoardState>(state)
  stateRef.current = state

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onOpenTask = useCallback((taskId: ID) => setSelectedTaskId(taskId), [])

  function onDragStart(event: DragStartEvent) {
    const id = event.active.id as ID
    const s = stateRef.current
    if (s.tasks[id]) {
      setActiveTaskId(id)
      dragOriginColumn.current = columnIdOf(s, id) ?? null
    }
  }

  // Move a card between columns *live* as it's dragged, so it visibly crosses over.
  function onDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return
    const s = stateRef.current
    const activeId = active.id as ID
    const overId = over.id as ID
    if (activeId === overId || !s.tasks[activeId]) return

    const activeColumn = columnIdOf(s, activeId)
    const overColumn = columnIdOf(s, overId)
    if (!activeColumn || !overColumn || activeColumn === overColumn) return

    const target = s.columns[overColumn]
    const overIsTask = Boolean(s.tasks[overId])
    const index = overIsTask ? Math.max(0, target.taskIds.indexOf(overId)) : target.taskIds.length
    moveTask(activeId, overColumn, index)
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    const originColumn = dragOriginColumn.current
    setActiveTaskId(null)
    dragOriginColumn.current = null
    if (!over) return

    const s = stateRef.current
    const activeId = active.id as ID
    const overId = over.id as ID

    if (s.tasks[activeId]) {
      const overColumn = columnIdOf(s, overId)
      if (!overColumn) return
      const target = s.columns[overColumn]
      const currentIndex = target.taskIds.indexOf(activeId)
      const index = s.tasks[overId] ? target.taskIds.indexOf(overId) : target.taskIds.length - 1
      if (index >= 0 && index !== currentIndex) moveTask(activeId, overColumn, index)
      // One activity entry per drag, only when the card actually changed column.
      if (originColumn && originColumn !== overColumn) {
        log(s.currentUserId, `moved “${s.tasks[activeId].title}” to ${target.title}`)
      }
    } else if (s.columns[activeId]) {
      const from = s.columnOrder.indexOf(activeId)
      const to = s.columnOrder.indexOf(overId)
      if (from !== -1 && to !== -1 && from !== to) moveColumn(from, to)
    }
  }

  function onDragCancel() {
    setActiveTaskId(null)
    dragOriginColumn.current = null
  }

  const activeTask = activeTaskId ? state.tasks[activeTaskId] : undefined
  const selectedTask = selectedTaskId ? state.tasks[selectedTaskId] : undefined
  const users = useMemo(() => Object.values(state.users), [state.users])
  const labelList = useMemo(() => Object.values(state.labels), [state.labels])

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className="board">
          <SortableContext items={state.columnOrder} strategy={horizontalListSortingStrategy}>
            {state.columnOrder.map((cid) => (
              <Column
                key={cid}
                column={state.columns[cid]}
                tasks={state.tasks}
                users={state.users}
                labels={state.labels}
                filters={filters}
                onOpenTask={onOpenTask}
                onAddTask={addTask}
                onRename={renameColumn}
                onDelete={deleteColumn}
                onSetWip={setWipLimit}
              />
            ))}
          </SortableContext>
          <AddColumn onAdd={addColumn} />
        </div>

        <DragOverlay>
          {activeTask ? (
            <TaskCardView
              task={activeTask}
              assignee={activeTask.assigneeId ? state.users[activeTask.assigneeId] : undefined}
              labels={activeTask.labelIds.map((id) => state.labels[id]).filter(Boolean)}
              overlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {selectedTask && (
        <TaskEditModal
          key={selectedTask.id}
          task={selectedTask}
          users={users}
          labels={labelList}
          usersById={state.users}
          onUpdate={updateTask}
          onDelete={(id) => {
            deleteTask(id)
            setSelectedTaskId(null)
          }}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </>
  )
}
