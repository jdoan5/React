// Domain model for the BMI Calculator.

export type UnitSystem = 'metric' | 'imperial'

export type BmiCategoryId =
  | 'underweight'
  | 'normal'
  | 'overweight'
  | 'obese1'
  | 'obese2'
  | 'obese3'

export interface BmiCategory {
  id: BmiCategoryId
  label: string
  /** Inclusive lower bound. */
  min: number
  /** Exclusive upper bound (Infinity on the final band). */
  max: number
  color: string
}

export interface BmiResult {
  bmi: number
  category: BmiCategory
  /** BMI ÷ 25 — above 1 means past the healthy upper bound. */
  prime: number
  /** Weight range (kg) that would put this height in the healthy band. */
  healthyRange: { minKg: number; maxKg: number }
  /** kg above (+) or below (−) the healthy band; 0 when already inside it. */
  deltaKg: number
}

export interface HistoryEntry {
  id: string
  at: number
  bmi: number
  categoryId: BmiCategoryId
  weightKg: number
  heightCm: number
}

/** Raw form fields, kept per unit system so typing never round-trips lossily. */
export interface Measurements {
  unit: UnitSystem
  cm: string
  kg: string
  ft: string
  inch: string
  lb: string
}
