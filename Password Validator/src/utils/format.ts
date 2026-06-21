function unit(value: number, label: string): string {
  const n = Math.round(value)
  return `${n} ${label}${n === 1 ? '' : 's'}`
}

/** Human-readable crack time from a raw seconds estimate. */
export function formatCrackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return seconds > 0 ? 'effectively forever' : 'instantly'
  if (seconds < 1) return 'less than a second'

  const minute = 60
  const hour = 60 * minute
  const day = 24 * hour
  const year = 365 * day

  if (seconds < minute) return unit(seconds, 'second')
  if (seconds < hour) return unit(seconds / minute, 'minute')
  if (seconds < day) return unit(seconds / hour, 'hour')
  if (seconds < year) return unit(seconds / day, 'day')

  const years = seconds / year
  if (years < 100) return unit(years, 'year')
  if (years < 1e4) {
    const c = Math.round(years / 100)
    return `${c} ${c === 1 ? 'century' : 'centuries'}`
  }
  if (years < 1e6) return `${Math.round(years / 1e3)} thousand years`
  if (years < 1e9) return `${Math.round(years / 1e6)} million years`
  if (years < 1e12) return `${Math.round(years / 1e9)} billion years`
  return 'effectively forever'
}
