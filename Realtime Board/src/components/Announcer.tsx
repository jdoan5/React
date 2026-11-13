import { useSyncExternalStore } from 'react'
import { getAnnouncement, subscribeAnnouncer } from '../utils/announcer'

/** Mounted once at the root and never unmounted — see utils/announcer.ts. */
export function Announcer() {
  const message = useSyncExternalStore(subscribeAnnouncer, getAnnouncement, () => '')
  return (
    <p aria-live="polite" className="sr-only">
      {message}
    </p>
  )
}
