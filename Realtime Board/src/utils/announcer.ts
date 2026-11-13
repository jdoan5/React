/**
 * One live region for the whole app, so status changes are actually read out.
 *
 * A live region only announces changes to content it ALREADY holds — one
 * inserted into the page with its text in place is usually silent. The panels
 * here come and go with each step ("Creating your board…" → the board), so
 * each would be inserted fresh. Instead they report to this store, and a
 * single region mounted once at the root (components/Announcer.tsx) speaks.
 */
let message = ''
const listeners = new Set<() => void>()

export function announce(text: string): void {
  if (text === message) return
  message = text
  for (const listener of listeners) listener()
}

export function getAnnouncement(): string {
  return message
}

export function subscribeAnnouncer(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
