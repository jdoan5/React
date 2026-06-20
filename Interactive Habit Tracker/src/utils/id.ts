/** Short, readable unique id with a type prefix, e.g. "habit_a1b2c3d4". */
export function uid(prefix = 'id'): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  return `${prefix}_${rand.replace(/-/g, '').slice(0, 8)}`
}
