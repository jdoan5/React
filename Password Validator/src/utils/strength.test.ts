import { describe, it, expect } from 'vitest'
import { evaluatePassword, scoreFromEntropy } from './strength'
import { estimateEntropy } from './entropy'
import { evaluateRules } from './rules'
import { formatCrackTime } from './format'

describe('estimateEntropy', () => {
  it('is 0 for an empty password', () => {
    expect(estimateEntropy('')).toBe(0)
  })
  it('grows with length', () => {
    expect(estimateEntropy('aB3$xY')).toBeLessThan(estimateEntropy('aB3$xY7!kLm#'))
  })
  it('penalises repeated characters', () => {
    expect(estimateEntropy('aaaaaaaa')).toBeLessThan(estimateEntropy('aB3$xY7!'))
  })
  it('penalises sequences', () => {
    expect(estimateEntropy('abcdefgh')).toBeLessThan(estimateEntropy('akxpfmqz'))
  })
})

describe('scoreFromEntropy', () => {
  it('maps bits to a 0–4 score', () => {
    expect(scoreFromEntropy(10)).toBe(0)
    expect(scoreFromEntropy(30)).toBe(1)
    expect(scoreFromEntropy(40)).toBe(2)
    expect(scoreFromEntropy(80)).toBe(3)
    expect(scoreFromEntropy(130)).toBe(4)
  })
})

describe('evaluatePassword', () => {
  it('flags a common password as very weak', () => {
    const r = evaluatePassword('password')
    expect(r.score).toBe(0)
    expect(r.warnings.some((w) => w.toLowerCase().includes('common'))).toBe(true)
  })
  it('rates a long, mixed password as strong', () => {
    const r = evaluatePassword('Tr0ub4dour&3xKp')
    expect(r.score).toBeGreaterThanOrEqual(3)
  })
  it('detects the character classes in use', () => {
    expect(evaluatePassword('Abc123!@').pools).toEqual({ lower: true, upper: true, digit: true, symbol: true })
  })
  it('offers suggestions for weak input', () => {
    const r = evaluatePassword('abc')
    expect(r.score).toBe(0)
    expect(r.suggestions.length).toBeGreaterThan(0)
  })
  it('treats an empty password as inert', () => {
    const r = evaluatePassword('')
    expect(r.score).toBe(0)
    expect(r.crackSeconds).toBe(0)
    expect(r.crackTime).toBe('instantly')
  })
})

describe('evaluateRules', () => {
  it('passes every rule for a compliant password', () => {
    expect(evaluateRules('Abcdef1!').every((r) => r.passed)).toBe(true)
  })
  it('fails length and missing classes for a short one', () => {
    const byId = Object.fromEntries(evaluateRules('abc').map((r) => [r.id, r.passed]))
    expect(byId.length).toBe(false)
    expect(byId.upper).toBe(false)
    expect(byId.lower).toBe(true)
  })
})

describe('formatCrackTime', () => {
  it('formats across ranges', () => {
    expect(formatCrackTime(0)).toBe('instantly')
    expect(formatCrackTime(0.5)).toBe('less than a second')
    expect(formatCrackTime(5)).toBe('5 seconds')
    expect(formatCrackTime(120)).toBe('2 minutes')
    expect(formatCrackTime(7200)).toBe('2 hours')
    expect(formatCrackTime(Infinity)).toBe('effectively forever')
  })
})
