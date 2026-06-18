import type { User } from '../types'
import { initials } from '../utils/format'

interface Props {
  user: User
  size?: number
  showStatus?: boolean
  title?: string
}

/** Circular initials avatar, optionally with a presence dot. */
export function Avatar({ user, size = 28, showStatus = false, title }: Props) {
  return (
    <span
      className="avatar"
      title={title ?? user.name}
      style={{ width: size, height: size, background: user.color, fontSize: Math.round(size * 0.4) }}
    >
      {initials(user.name)}
      {showStatus && <span className={`avatar__status ${user.online ? 'is-online' : 'is-offline'}`} />}
    </span>
  )
}
