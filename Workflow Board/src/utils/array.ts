/** Immutably move an item from one index to another. */
export function arrayMove<T>(arr: readonly T[], from: number, to: number): T[] {
  const next = arr.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(n, max))
}
