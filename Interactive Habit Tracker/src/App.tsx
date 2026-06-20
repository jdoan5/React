import { useState } from 'react'
import type { Habit } from './types'
import { useHabits } from './hooks/useHabits'
import { useLocalStorage } from './hooks/useLocalStorage'
import { Header } from './components/Header'
import { HabitCard } from './components/HabitCard'
import { HabitForm } from './components/HabitForm'
import { EmptyState } from './components/EmptyState'

export default function App() {
  const { activeHabits, archivedHabits, setArchived } = useHabits()
  // undefined = form closed, null = creating, Habit = editing that habit
  const [editing, setEditing] = useState<Habit | null | undefined>(undefined)
  const [showArchived, setShowArchived] = useLocalStorage('habit-tracker:show-archived', false)

  return (
    <div className="app">
      <Header
        onAddHabit={() => setEditing(null)}
        showArchived={showArchived}
        onToggleArchived={() => setShowArchived((v) => !v)}
        hasArchived={archivedHabits.length > 0}
      />

      <main className="content">
        {activeHabits.length === 0 ? (
          <EmptyState onAdd={() => setEditing(null)} />
        ) : (
          <div className="grid">
            {activeHabits.map((habit) => (
              <HabitCard key={habit.id} habit={habit} onEdit={(h) => setEditing(h)} />
            ))}
          </div>
        )}

        {showArchived && archivedHabits.length > 0 && (
          <section className="archived">
            <h2 className="archived__title">Archived</h2>
            <div className="archived__list">
              {archivedHabits.map((habit) => (
                <div key={habit.id} className="archived__item">
                  <span>
                    {habit.emoji} {habit.name}
                  </span>
                  <button className="btn btn--ghost btn--sm" onClick={() => setArchived(habit.id, false)}>
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {editing !== undefined && <HabitForm habit={editing ?? null} onClose={() => setEditing(undefined)} />}
    </div>
  )
}
