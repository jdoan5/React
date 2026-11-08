import { useMemo, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { demoSnapshot } from './data/seed'
import { planInsert, planMove, sortByOrder } from './lib/ordering'
import { BoardColumn } from './components/BoardColumn'
import { CardTile } from './components/CardTile'
import type { BoardSnapshot, Card, ID } from './types'

/**
 * Stage 1 of the build: the board, driven entirely by the pure ordering core.
 *
 * Every drag goes through planMove/planInsert and writes ONE order key — exactly
 * the operation the Supabase adapter will send as a single UPDATE. Getting this
 * right with no network in the way is the point: when realtime lands, the only
 * new thing is where the write goes, not how the order is computed.
 */
export default function App() {
  const [snapshot, setSnapshot] = useState<BoardSnapshot>(() => demoSnapshot())
  const [draggingId, setDraggingId] = useState<ID | null>(null)

  const columns = useMemo(() => sortByOrder(Object.values(snapshot.columns)), [snapshot.columns])

  const cardsByColumn = useMemo(() => {
    const grouped: Record<ID, Card[]> = {}
    for (const column of columns) grouped[column.id] = []
    for (const card of Object.values(snapshot.cards)) {
      ;(grouped[card.columnId] ??= []).push(card)
    }
    for (const id of Object.keys(grouped)) grouped[id] = sortByOrder(grouped[id]!)
    return grouped
  }, [snapshot.cards, columns])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const activeCard = draggingId ? snapshot.cards[draggingId] : undefined

  function columnOf(id: ID): ID | undefined {
    if (snapshot.columns[id]) return id
    return snapshot.cards[id]?.columnId
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingId(null)
    const { active, over } = event
    if (!over) return

    const cardId = String(active.id)
    const card = snapshot.cards[cardId]
    if (!card) return

    const toColumnId = columnOf(String(over.id))
    if (!toColumnId) return

    const target = cardsByColumn[toColumnId] ?? []
    const overIndex = target.findIndex((c) => c.id === String(over.id))
    const toIndex = overIndex === -1 ? target.length : overIndex

    // Same column: a move, which can be a no-op. Different column: always an insert.
    const orderKey =
      card.columnId === toColumnId
        ? planMove(target, cardId, toIndex)
        : planInsert(target, toIndex)

    if (orderKey === null) return // dropped where it already was

    setSnapshot((prev) => ({
      ...prev,
      cards: {
        ...prev.cards,
        [cardId]: { ...card, columnId: toColumnId, orderKey, rev: card.rev + 1 },
      },
    }))
  }

  function handleDragStart(event: DragStartEvent) {
    setDraggingId(String(event.active.id))
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar__title">
          <h1>{snapshot.title}</h1>
          <span className="badge badge--demo" title="No Supabase credentials configured">
            Demo mode
          </span>
        </div>
        <p className="topbar__note">
          Drag a card. Every move writes one fractional order key, never a renumbered
          column — so two people dragging at once cannot clobber each other.
        </p>
      </header>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setDraggingId(null)}
      >
        <main className="board">
          {columns.map((column) => {
            const cards = cardsByColumn[column.id] ?? []
            return (
              <SortableContext
                key={column.id}
                items={cards.map((c) => c.id)}
                strategy={verticalListSortingStrategy}
              >
                <BoardColumn column={column} count={cards.length}>
                  {cards.map((card) => (
                    <CardTile key={card.id} card={card} dragging={card.id === draggingId} />
                  ))}
                </BoardColumn>
              </SortableContext>
            )
          })}
        </main>
      </DndContext>

      <footer className="foot">
        <strong>Stage 1 of 3.</strong> The ordering core is done and tested — 83 Vitest
        cases over <code>fracIndex.ts</code> and <code>ordering.ts</code>, including the
        golden vectors from the reference implementation. Next: the command queue
        (optimistic apply with rollback), then the Supabase adapter, presence and cursors.
        {activeCard ? <span className="foot__drag"> Dragging “{activeCard.title}”.</span> : null}
      </footer>
    </div>
  )
}
