import { useRef, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useBoard } from '../hooks/useBoard'
import { useCards } from '../hooks/useCards'
import { useCursors } from '../hooks/useCursors'
import { BoardColumn } from './BoardColumn'
import { CardTile } from './CardTile'
import { CursorLayer } from './CursorLayer'
import type { ID } from '../types'

export function Board() {
  const { board } = useBoard()
  const { createCard, moveCard, rebalanceColumn } = useCards()
  const { cursors, sendCursor } = useCursors()
  const [draggingId, setDraggingId] = useState<ID | null>(null)
  const surface = useRef<HTMLDivElement>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  function columnOf(id: ID): ID | undefined {
    if (board.columns[id]) return id
    return board.cards[id]?.column_id
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingId(null)
    const { active, over } = event
    if (!over) return

    const cardId = String(active.id)
    const toColumnId = columnOf(String(over.id))
    if (!toColumnId) return

    const target = board.columns[toColumnId]?.cardIds ?? []
    const overIndex = target.indexOf(String(over.id))
    // Dropping on the column itself (not a card) means "append".
    moveCard(cardId, toColumnId, overIndex === -1 ? target.length : overIndex)
  }

  function handlePointerMove(event: React.PointerEvent) {
    const rect = surface.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || rect.height === 0) return
    // Fractions, not pixels, so a cursor lands in the right place on a screen
    // that is not the same size as the sender's.
    sendCursor(
      (event.clientX - rect.left) / rect.width,
      (event.clientY - rect.top) / rect.height,
      draggingId,
    )
  }

  return (
    <div className="board-surface" onPointerMove={handlePointerMove} ref={surface}>
      <DndContext
        collisionDetection={closestCorners}
        onDragCancel={() => setDraggingId(null)}
        onDragEnd={handleDragEnd}
        onDragStart={(event: DragStartEvent) => setDraggingId(String(event.active.id))}
        sensors={sensors}
      >
        <main className="board">
          {board.columnOrder.map((columnId) => {
            const column = board.columns[columnId]
            if (!column) return null
            const cards = column.cardIds.map((id) => board.cards[id]).filter((c) => c !== undefined)
            return (
              <SortableContext
                items={column.cardIds as ID[]}
                key={columnId}
                strategy={verticalListSortingStrategy}
              >
                <BoardColumn
                  column={column}
                  keys={cards.map((c) => c.order_key)}
                  onAddCard={(title) => createCard(columnId, title)}
                  onRebalance={() => rebalanceColumn(columnId)}
                >
                  {cards.map((card) => (
                    <CardTile card={card} dragging={card.id === draggingId} key={card.id} />
                  ))}
                </BoardColumn>
              </SortableContext>
            )
          })}
        </main>
      </DndContext>
      <CursorLayer cursors={cursors} />
    </div>
  )
}
