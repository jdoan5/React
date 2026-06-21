import type { Pools } from '../types'
import { POOLS } from '../constants'
import { hasSequential, longestRepeatRun } from './patterns'

/** Which character classes appear in the password. */
export function detectPools(password: string): Pools {
  return {
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    digit: /[0-9]/.test(password),
    symbol: /[^a-zA-Z0-9]/.test(password),
  }
}

/** Size of the alphabet an attacker must brute-force, given the classes used. */
export function poolSize(pools: Pools): number {
  let size = 0
  if (pools.lower) size += 26
  if (pools.upper) size += 26
  if (pools.digit) size += 10
  if (pools.symbol) size += POOLS.symbol.length
  return size
}

/** Naive entropy: length × log2(poolSize). Overstates predictable passwords. */
export function rawEntropyBits(password: string): number {
  if (!password) return 0
  const size = poolSize(detectPools(password))
  return size > 0 ? password.length * Math.log2(size) : 0
}

/**
 * Effective entropy: the naive figure discounted for low character variety,
 * sequences, and repeats — a lightweight stand-in for a full estimator.
 */
export function estimateEntropy(password: string): number {
  if (!password) return 0
  const base = rawEntropyBits(password)
  const variety = new Set(password).size / password.length
  let factor = 0.4 + 0.6 * variety
  if (hasSequential(password)) factor *= 0.6
  if (longestRepeatRun(password) >= 3) factor *= 0.7
  return Math.max(0, base * factor)
}
