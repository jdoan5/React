/** "AR" from "Alex Rivera" — up to two uppercase initials. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

/** Compact "time ago" label for the activity feed. */
export function formatRelativeTime(ts: number): string {
  const sec = Math.round((Date.now() - ts) / 1000)
  if (sec < 10) return 'just now'
  if (sec < 60) return `${sec}s ago`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 7) return `${day}d ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function dueAtMidnight(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}

/** "Jun 20" style label for a due date. */
export function formatDueDate(iso: string): string {
  return dueAtMidnight(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function isOverdue(iso: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return dueAtMidnight(iso) < today
}

/** Today's date as an ISO yyyy-mm-dd string, for date inputs. */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}
