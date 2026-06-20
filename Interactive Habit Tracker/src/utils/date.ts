// All dates are handled as local-time "yyyy-mm-dd" strings, which sort
// lexicographically and sidestep timezone drift from Date arithmetic.

export type ISODate = string

export function toISO(d: Date): ISODate {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayISO(): ISODate {
  return toISO(new Date())
}

/** Parse to a local-midnight Date (so getDay() is timezone-stable). */
export function parseISO(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(iso: ISODate, n: number): ISODate {
  const d = parseISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(iso: ISODate): number {
  return parseISO(iso).getDay()
}

/** Whole-day difference a − b (positive when a is later). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86_400_000)
}

/** Inclusive list of dates from `from` to `to`. */
export function rangeISO(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = []
  for (let c = from; c <= to; c = addDays(c, 1)) out.push(c)
  return out
}

/** Most recent `weekStartsOn` (default Sunday) on or before `iso`. */
export function startOfWeek(iso: ISODate, weekStartsOn = 0): ISODate {
  const diff = (weekdayOf(iso) - weekStartsOn + 7) % 7
  return addDays(iso, -diff)
}

export function formatDay(iso: ISODate): string {
  return parseISO(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatLong(iso: ISODate): string {
  return parseISO(iso).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
}

export function monthShort(iso: ISODate): string {
  return parseISO(iso).toLocaleDateString(undefined, { month: 'short' })
}
