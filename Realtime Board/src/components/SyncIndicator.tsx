import { useSync } from '../hooks/useSync'

const STATUS_LABEL = {
  connecting: 'Connecting',
  live: 'Live',
  reconnecting: 'Reconnecting',
  offline: 'Offline',
} as const

/**
 * Status, how much is unconfirmed, and anything that failed.
 *
 * Rejected commands are deliberately kept out of the board (a rejected write
 * did not happen, so rendering it would be a lie) but kept in the queue so the
 * user is told rather than silently losing an edit.
 */
export function SyncIndicator() {
  const { status, detail, pendingCount, rejected, dismiss } = useSync()

  return (
    <div className="sync">
      <span className={`sync__dot sync__dot--${status}`} />
      <span className="sync__label">{STATUS_LABEL[status]}</span>
      {pendingCount > 0 ? (
        <span className="sync__pending">
          {pendingCount} unsaved {pendingCount === 1 ? 'change' : 'changes'}
        </span>
      ) : null}
      {detail ? <span className="sync__detail">{detail}</span> : null}

      {rejected.length > 0 ? (
        <div className="rejects" role="alert">
          <strong>
            {rejected.length} {rejected.length === 1 ? 'change' : 'changes'} could not be saved
          </strong>
          <ul>
            {rejected.map((envelope) => (
              <li key={envelope.id}>
                <code>{envelope.command.kind}</code> — {envelope.rejection?.message ?? 'rejected'}
              </li>
            ))}
          </ul>
          <button onClick={() => dismiss(rejected.map((e) => e.id))} type="button">
            Dismiss
          </button>
        </div>
      ) : null}
    </div>
  )
}
