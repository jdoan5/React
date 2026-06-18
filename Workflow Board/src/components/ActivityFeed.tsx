import { useActivityFeed } from '../hooks/useActivityFeed'
import { formatRelativeTime } from '../utils/format'
import { Avatar } from './Avatar'

export function ActivityFeed() {
  const items = useActivityFeed(50)

  return (
    <aside className="activity">
      <h2 className="activity__title">Activity</h2>
      <div className="activity__list">
        {items.length === 0 && <p className="activity__empty">No activity yet.</p>}
        {items.map(({ entry, user }) => (
          <div key={entry.id} className="activity__item">
            {user && <Avatar user={user} size={24} />}
            <div className="activity__body">
              <p>
                <strong>{user?.name ?? 'Someone'}</strong> {entry.message}
              </p>
              <time className="activity__time">{formatRelativeTime(entry.timestamp)}</time>
            </div>
          </div>
        ))}
      </div>
    </aside>
  )
}
