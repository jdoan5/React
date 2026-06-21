import type { Evaluation, StrengthLevel } from '../types'
import { ENTROPY_THRESHOLDS, GUESSES_PER_SECOND, MIN_LENGTH, STRENGTH_LABELS } from '../constants'
import { isCommonPassword } from '../data/commonPasswords'
import { detectPools, estimateEntropy } from './entropy'
import { hasSequential, longestRepeatRun } from './patterns'
import { evaluateRules } from './rules'
import { formatCrackTime } from './format'

export function scoreFromEntropy(bits: number): StrengthLevel {
  let score = 0
  for (const threshold of ENTROPY_THRESHOLDS) {
    if (bits >= threshold) score += 1
  }
  return score as StrengthLevel
}

/** Average guesses to crack = 2^bits / 2, divided by the attacker's guess rate. */
export function crackSeconds(bits: number): number {
  return 2 ** bits / 2 / GUESSES_PER_SECOND
}

/** The single entry point the UI uses: everything derived from one password. */
export function evaluatePassword(password: string): Evaluation {
  const pools = detectPools(password)
  const bits = estimateEntropy(password)
  let score = scoreFromEntropy(bits)

  const warnings: string[] = []
  const suggestions: string[] = []

  if (password && isCommonPassword(password)) {
    warnings.push('This is one of the most common passwords — change it.')
    score = 0
  }
  if (longestRepeatRun(password) >= 3) warnings.push('Avoid repeating the same character.')
  if (hasSequential(password)) warnings.push('Avoid sequences like “abcd”, “1234”, or “qwerty”.')

  if (password.length > 0 && password.length < MIN_LENGTH) {
    suggestions.push(`Use at least ${MIN_LENGTH} characters — longer is stronger.`)
  }
  if (!pools.lower || !pools.upper) suggestions.push('Mix uppercase and lowercase letters.')
  if (!pools.digit) suggestions.push('Add a number.')
  if (!pools.symbol) suggestions.push('Add a symbol (e.g. ! @ # $).')

  const seconds = password ? crackSeconds(bits) : 0

  return {
    password,
    length: password.length,
    entropyBits: Math.round(bits * 10) / 10,
    score,
    label: STRENGTH_LABELS[score],
    crackSeconds: seconds,
    crackTime: formatCrackTime(seconds),
    rules: evaluateRules(password),
    warnings,
    suggestions,
    pools,
  }
}
