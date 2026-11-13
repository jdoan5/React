import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BoardProvider } from './state/BoardContext'
import { Announcer } from './components/Announcer'
import { Board } from './components/Board'
import { BoardMessage } from './components/BoardMessage'
import { BoardSwitcher } from './components/BoardSwitcher'
import { DemoControls } from './components/DemoControls'
import { InviteButton } from './components/InviteButton'
import { PresenceBar } from './components/PresenceBar'
import { SyncIndicator } from './components/SyncIndicator'
import { useBoard } from './hooks/useBoard'
import { goToNewBoard, useBoardRoute } from './hooks/useBoardRoute'
import { useBoardLabel, useRememberBoard } from './hooks/useRecentBoards'
import { DEMO_BOARD_ID } from './data/seed'
import { createDirectory } from './sync'
import type { BoardDirectory } from './sync/adapter'
import { announce } from './utils/announcer'
import { takeFocusRequest } from './utils/focusIntent'

const MOVE_NOTE =
  'Every move writes one fractional order key, so two people dragging at once cannot clobber each other.'

/**
 * "Supabase" names the MODE, deliberately not "Live": the sync indicator
 * beside it already says live / offline, and a badge reading LIVE next to an
 * "Offline" dot is a contradiction on screen.
 */
function ModeBadge({ live, reason }: { live: boolean; reason?: string }) {
  return live ? (
    <span className="badge badge--live">Supabase</span>
  ) : (
    <span className="badge badge--demo" title={reason}>
      Demo mode
    </span>
  )
}

function Header() {
  const { mode, reason, loaded, failure } = useBoard()
  const label = useBoardLabel()
  const live = mode === 'supabase'
  // Invite controls only for a board that is actually open: offering to share
  // a board you cannot see would fail with a raw database error.
  const open = loaded && failure === null
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    // After the user switched or created a board, land them on its name —
    // but only once it has loaded, so the heading says which board it is.
    if (loaded && takeFocusRequest()) heading.current?.focus()
  }, [loaded])

  return (
    <header className="topbar">
      <div className="topbar__row">
        <h1 ref={heading} tabIndex={-1}>
          {label}
        </h1>
        <ModeBadge live={live} reason={reason} />
        <div className="topbar__spacer" />
        {live ? <BoardSwitcher /> : null}
        <PresenceBar />
        <SyncIndicator />
        {live && open ? <InviteButton /> : null}
      </div>
      <p className="topbar__note">
        {!live
          ? 'No Supabase credentials — open this page in a second tab and watch the two stay in sync.'
          : open
            ? 'Copy the invite link, and anyone who opens it joins this board. Moves, edits and cursors appear for everyone at once.'
            : 'A shared board on Supabase.'}{' '}
        {MOVE_NOTE}
      </p>
    </header>
  )
}

function HowItWorks() {
  return (
    <p>
      <strong>How it works.</strong> The snapshot holds what the server confirmed; the command queue
      holds what you asked for. They never touch, and what renders is <code>project(snapshot, queue)</code>{' '}
      — which makes rollback a list removal and stops a collaborator&rsquo;s change from clobbering your
      in-flight edit.
    </p>
  )
}

/** No credentials: the seeded board, synced between this browser's tabs. */
function DemoApp() {
  const [chaos, setChaos] = useState({ latencyMs: 250, failureRate: 0 })

  return (
    // The key remounts the provider when a knob changes: the adapter is created
    // once per board and its clientId has to stay stable, so the honest way to
    // change its options is a fresh one.
    <BoardProvider boardId={DEMO_BOARD_ID} key={`${chaos.latencyMs}:${chaos.failureRate}`} localOptions={chaos}>
      <Header />
      <Board />
      <footer className="foot">
        <DemoControls failureRate={chaos.failureRate} latencyMs={chaos.latencyMs} onChange={setChaos} />
        <HowItWorks />
      </footer>
    </BoardProvider>
  )
}

/** Supabase: the front door picked or created a board, and this renders it. */
function LiveBoard() {
  const { loaded, failure } = useBoard()
  const label = useBoardLabel()
  useRememberBoard()

  // Once per board: the label can still gain its suffix after the board is
  // remembered, and re-announcing then would read the same news twice.
  const announced = useRef(false)
  useEffect(() => {
    if (failure) announce(failure.message)
    else if (loaded && !announced.current) {
      announced.current = true
      announce(`Opened ${label}.`)
    }
  }, [failure, loaded, label])

  // Clear on the way out, so the next board's message counts as a change even
  // when its text happens to match — a live region only speaks on a change.
  useEffect(
    () => () => {
      announced.current = false
      announce('')
    },
    [],
  )

  return (
    <>
      <Header />
      {failure === null ? (
        <Board />
      ) : failure.terminal ? (
        <BoardMessage
          action={{ label: 'Start a new board', run: goToNewBoard }}
          body={failure.message}
          title="You can't open this board"
        />
      ) : (
        <BoardMessage
          action={{ label: 'Try again', run: () => window.location.reload() }}
          body={failure.message}
          title="Couldn't reach the board"
        />
      )}
      <footer className="foot">
        <HowItWorks />
      </footer>
    </>
  )
}

/** Before a board exists there is no provider, so no Header — just the name and the state. */
function GateShell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="topbar">
        <div className="topbar__row">
          <h1>Realtime Board</h1>
          <ModeBadge live />
        </div>
      </header>
      {children}
    </>
  )
}

function LiveApp({ directory }: { directory: BoardDirectory }) {
  const route = useBoardRoute(directory)
  const errorMessage = route.status === 'error' ? route.message : null

  useEffect(() => {
    if (route.status === 'resolving') announce('Creating your board…')
    else if (errorMessage) announce(`Couldn't open a board. ${errorMessage}`)
  }, [route.status, errorMessage])

  if (route.status === 'resolving') {
    return (
      <GateShell>
        <BoardMessage body="Setting up a board with four columns for you." title="Creating your board…" />
      </GateShell>
    )
  }
  if (route.status === 'error') {
    return (
      <GateShell>
        <BoardMessage action={route.action} body={route.message} title="Couldn't open a board" />
      </GateShell>
    )
  }
  return (
    // Keyed on board AND invite: a new board resets every piece of state, and a
    // newly pasted invite for the same board re-runs the join it was missing.
    <BoardProvider boardId={route.boardId} invite={route.invite} key={`${route.boardId}:${route.invite ?? ''}`}>
      <LiveBoard />
    </BoardProvider>
  )
}

export default function App() {
  // Null without credentials — which is exactly the test for demo mode.
  const [directory] = useState(createDirectory)
  return (
    <div className="app">
      {directory ? <LiveApp directory={directory} /> : <DemoApp />}
      <Announcer />
    </div>
  )
}
