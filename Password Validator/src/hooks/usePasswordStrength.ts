import { useMemo } from 'react'
import { evaluatePassword } from '../utils/strength'

/** Memoised full evaluation for a password — re-runs only when the text changes. */
export function usePasswordStrength(password: string) {
  return useMemo(() => evaluatePassword(password), [password])
}
