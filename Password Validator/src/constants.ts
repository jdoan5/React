import type { GeneratorOptions } from './types'

export const POOLS = {
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digit: '0123456789',
  // Kept free of quotes/backslashes to avoid escaping headaches.
  symbol: '!@#$%^&*()_-+=[]{}|;:,.<>?/~',
}

/** Easily-confused characters, optionally excluded by the generator. */
export const AMBIGUOUS = 'Il1O0o'

export const STRENGTH_LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'] as const
export const STRENGTH_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#16a34a']

/** Entropy (bits) cut-offs → score. <28 = 0, ≥28 = 1, ≥36 = 2, ≥60 = 3, ≥120 = 4. */
export const ENTROPY_THRESHOLDS = [28, 36, 60, 120]

/** Guesses/sec for an offline fast-hash attacker (order-of-magnitude estimate). */
export const GUESSES_PER_SECOND = 1e10

export const MIN_LENGTH = 8

export const DEFAULT_GENERATOR: GeneratorOptions = {
  length: 16,
  lowercase: true,
  uppercase: true,
  numbers: true,
  symbols: true,
  avoidAmbiguous: false,
}

export const GENERATOR_LENGTH = { min: 6, max: 40 }
