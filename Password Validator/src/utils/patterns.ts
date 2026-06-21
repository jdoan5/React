// Pattern detectors used to penalise predictable passwords.

/** Longest run of the same character, e.g. "aaab" → 3. */
export function longestRepeatRun(password: string): number {
  let best = 0
  let run = 0
  let prev = ''
  for (const ch of password) {
    run = ch === prev ? run + 1 : 1
    prev = ch
    if (run > best) best = run
  }
  return best
}

/** Longest run of adjacent code points (ascending or descending), e.g. "abcd" or "4321". */
export function longestSequentialRun(password: string): number {
  if (password.length === 0) return 0
  const lower = password.toLowerCase()
  let best = 1
  let run = 1
  for (let i = 1; i < lower.length; i += 1) {
    const delta = lower.charCodeAt(i) - lower.charCodeAt(i - 1)
    if (delta === 1 || delta === -1) {
      run += 1
      if (run > best) best = run
    } else {
      run = 1
    }
  }
  return best
}

const KEYBOARD_SEQUENCES = [
  'abcdefghijklmnopqrstuvwxyz',
  '0123456789',
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
]

/** Does the password contain a recognisable keyboard/alphabet/number sequence? */
export function hasSequential(password: string, minLen = 4): boolean {
  if (password.length < minLen) return false
  const lower = password.toLowerCase()
  for (const seq of KEYBOARD_SEQUENCES) {
    const reversed = [...seq].reverse().join('')
    for (let i = 0; i + minLen <= lower.length; i += 1) {
      const sub = lower.slice(i, i + minLen)
      if (seq.includes(sub) || reversed.includes(sub)) return true
    }
  }
  return longestSequentialRun(password) >= minLen
}

export function hasRepeats(password: string, min = 3): boolean {
  return longestRepeatRun(password) >= min
}
