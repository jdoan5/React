// Domain model for the Password Validator.

/** 0 = Very weak … 4 = Very strong. */
export type StrengthLevel = 0 | 1 | 2 | 3 | 4

export interface Rule {
  id: string
  label: string
  test: (password: string) => boolean
}

export interface RuleResult {
  id: string
  label: string
  passed: boolean
}

export interface Pools {
  lower: boolean
  upper: boolean
  digit: boolean
  symbol: boolean
}

export interface Evaluation {
  password: string
  length: number
  /** Estimated effective entropy in bits (after pattern penalties). */
  entropyBits: number
  score: StrengthLevel
  label: string
  /** Estimated seconds for an offline attacker to crack it. */
  crackSeconds: number
  crackTime: string
  rules: RuleResult[]
  warnings: string[]
  suggestions: string[]
  pools: Pools
}

export interface GeneratorOptions {
  length: number
  lowercase: boolean
  uppercase: boolean
  numbers: boolean
  symbols: boolean
  /** Exclude easily-confused characters like l, 1, O, 0. */
  avoidAmbiguous: boolean
}
