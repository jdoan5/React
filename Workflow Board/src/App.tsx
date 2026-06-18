import { useFilters } from './hooks/useFilters'
import { useLocalStorage } from './hooks/useLocalStorage'
import { useSimulatedCollaborators } from './hooks/useSimulatedCollaborators'
import { Toolbar } from './components/Toolbar'
import { Board } from './components/Board'
import { ActivityFeed } from './components/ActivityFeed'

export default function App() {
  const f = useFilters()
  const [simEnabled, setSimEnabled] = useLocalStorage('workflow-board:sim', false)
  const [activityOpen, setActivityOpen] = useLocalStorage('workflow-board:activity-open', true)

  // Drives the "multiplayer" illusion when the Live toggle is on.
  useSimulatedCollaborators(simEnabled)

  return (
    <div className={`app${activityOpen ? ' app--with-activity' : ''}`}>
      <Toolbar
        search={f.filters.search}
        onSearch={f.setSearch}
        assigneeId={f.filters.assigneeId}
        onAssignee={f.setAssignee}
        labelId={f.filters.labelId}
        onLabel={f.setLabel}
        filtersActive={f.active}
        onResetFilters={f.reset}
        simEnabled={simEnabled}
        onToggleSim={() => setSimEnabled((v) => !v)}
        activityOpen={activityOpen}
        onToggleActivity={() => setActivityOpen((v) => !v)}
      />

      <main className="app__body">
        <Board filters={f.filters} />
        {activityOpen && <ActivityFeed />}
      </main>
    </div>
  )
}
