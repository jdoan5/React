import type { Rule, RuleResult } from '../types'
import { MIN_LENGTH } from '../constants'
import { isCommonPassword } from '../data/commonPasswords'

/** The requirement checklist shown live as the user types. */
export const RULES: Rule[] = [
  { id: 'length', label: `At least ${MIN_LENGTH} characters`, test: (p) => p.length >= MIN_LENGTH },
  { id: 'lower', label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'upper', label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'number', label: 'A number', test: (p) => /[0-9]/.test(p) },
  { id: 'symbol', label: 'A symbol', test: (p) => /[^a-zA-Z0-9]/.test(p) },
  { id: 'notcommon', label: 'Not a common password', test: (p) => p.length > 0 && !isCommonPassword(p) },
]

export function evaluateRules(password: string): RuleResult[] {
  return RULES.map((rule) => ({ id: rule.id, label: rule.label, passed: rule.test(password) }))
}
