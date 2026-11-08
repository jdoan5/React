import { useState } from 'react'
import { BoardProvider } from './state/BoardContext'
import { Board } from './components/Board'
import { PresenceBar } from './components/PresenceBar'
import { SyncIndicator } from './components/SyncIndicator'
import { DemoControls } from './components/DemoControls'
import { useBoard } from './hooks/useBoard'
import { DEMO_BOARD_ID } from './data/seed'

function Header() {
  const { board, mode, reason } = useBoard()
  return (
    <header className="topbar">
      <div className="topbar__row">
        <h1>{board.title}</h1>
        {mode === 'local' ? (
          <span className="badge badge--demo" title={reason}>
            Demo mode
          </span>
        ) : (
          <span className="badge badge--live">Supabase</span>
        )}
        <div className="topbar__spacer" />
        <PresenceBar />
        <SyncIndicator />
      </div>
      <p className="topbar__note">
        {mode === 'local'
          ? 'No Supabase credentials — open this page in a second tab and watch the two stay in sync.'
          : 'Connected to Supabase. Open this board in another browser to collaborate.'}{' '}
        Every move writes one fractional order key, so two people dragging at once cannot
        clobber each other.
      </p>
    </header>
  )
}

export default function App() {
  const [chaos, setChaos] = useState({ latencyMs: 250, failureRate: 0 })

  return (
    <div className="app">
      {/* The key remounts the provider when a knob changes: the adapter is
          created once per board and its clientId has to stay stable, so the
          honest way to change its options is a fresh one. */}
      <BoardProvider
        boardId={DEMO_BOARD_ID}
        key={`${chaos.latencyMs}:${chaos.failureRate}`}
        localOptions={chaos}
      >
        <Header />
        <Board />
        <footer className="foot">
          <DemoControls
            failureRate={chaos.failureRate}
            latencyMs={chaos.latencyMs}
            onChange={setChaos}
          />
          <p>
            <strong>How it works.</strong> The snapshot holds what the server confirmed; the
            command queue holds what you asked for. They never touch, and what renders is{' '}
            <code>project(snapshot, queue)</code> — which makes rollback a list removal and stops
            a collaborator&rsquo;s change from clobbering your in-flight edit.
          </p>
        </footer>
      </BoardProvider>
    </div>
  )
}
