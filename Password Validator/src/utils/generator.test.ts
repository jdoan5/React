import { describe, it, expect } from 'vitest'
import { buildCharset, generatePassword } from './generator'
import { AMBIGUOUS } from '../constants'
import type { GeneratorOptions } from '../types'

const base: GeneratorOptions = {
  length: 16,
  lowercase: true,
  uppercase: true,
  numbers: true,
  symbols: true,
  avoidAmbiguous: false,
}

describe('generatePassword', () => {
  it('produces the requested length', () => {
    expect(generatePassword(base)).toHaveLength(16)
    expect(generatePassword({ ...base, length: 24 })).toHaveLength(24)
  })

  it('includes at least one of every enabled class', () => {
    const pw = generatePassword(base)
    expect(/[a-z]/.test(pw)).toBe(true)
    expect(/[A-Z]/.test(pw)).toBe(true)
    expect(/[0-9]/.test(pw)).toBe(true)
    expect(/[^a-zA-Z0-9]/.test(pw)).toBe(true)
  })

  it('respects a single enabled class', () => {
    const pw = generatePassword({ ...base, uppercase: false, numbers: false, symbols: false })
    expect(/^[a-z]+$/.test(pw)).toBe(true)
  })

  it('avoids ambiguous characters when asked', () => {
    const pw = generatePassword({ ...base, avoidAmbiguous: true, length: 40 })
    for (const ch of AMBIGUOUS) expect(pw.includes(ch)).toBe(false)
  })

  it('returns empty when no classes are enabled', () => {
    const pw = generatePassword({ ...base, lowercase: false, uppercase: false, numbers: false, symbols: false })
    expect(pw).toBe('')
  })
})

describe('buildCharset', () => {
  it('excludes ambiguous characters when requested', () => {
    const set = buildCharset({ ...base, avoidAmbiguous: true })
    expect(set.includes('l')).toBe(false)
    expect(set.includes('0')).toBe(false)
    expect(set.includes('O')).toBe(false)
  })
})
