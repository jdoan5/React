import type { GeneratorOptions } from '../types'
import { AMBIGUOUS, POOLS } from '../constants'

/** Unbiased random integer in [0, max) using the Web Crypto API (rejection sampling). */
function randomInt(max: number): number {
  const buf = new Uint32Array(1)
  const limit = Math.floor(0xffffffff / max) * max
  let value: number
  do {
    crypto.getRandomValues(buf)
    value = buf[0]
  } while (value >= limit)
  return value % max
}

function pick(chars: string): string {
  return chars[randomInt(chars.length)]
}

function stripAmbiguous(chars: string): string {
  return [...chars].filter((c) => !AMBIGUOUS.includes(c)).join('')
}

export function buildCharset(opts: GeneratorOptions): string {
  let set = ''
  if (opts.lowercase) set += POOLS.lower
  if (opts.uppercase) set += POOLS.upper
  if (opts.numbers) set += POOLS.digit
  if (opts.symbols) set += POOLS.symbol
  return opts.avoidAmbiguous ? stripAmbiguous(set) : set
}

/**
 * Generate a password that uses each enabled class at least once, then fills the
 * rest from the full charset and shuffles — all with cryptographically secure RNG.
 */
export function generatePassword(opts: GeneratorOptions): string {
  const charset = buildCharset(opts)
  if (!charset) return ''

  const enabled = [
    opts.lowercase && POOLS.lower,
    opts.uppercase && POOLS.upper,
    opts.numbers && POOLS.digit,
    opts.symbols && POOLS.symbol,
  ].filter((p): p is string => Boolean(p))

  const length = Math.max(1, Math.floor(opts.length))
  const chars: string[] = []

  for (const pool of enabled) {
    const usable = opts.avoidAmbiguous ? stripAmbiguous(pool) : pool
    if (usable) chars.push(pick(usable))
  }
  while (chars.length < length) chars.push(pick(charset))

  // Fisher–Yates shuffle so the guaranteed characters aren't always first.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }

  return chars.slice(0, length).join('')
}
