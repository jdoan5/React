// The core of the app: unit conversion and BMI maths as pure functions, so the
// fiddly parts (category boundaries, healthy-weight inversion) are unit-testable.

import { CATEGORIES, HEALTHY_BMI } from '../constants'
import type { BmiCategory, BmiResult } from '../types'

const KG_PER_LB = 0.45359237
const CM_PER_INCH = 2.54

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB
}

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB
}

export function ftInToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * CM_PER_INCH
}

export function cmToFtIn(cm: number): { feet: number; inches: number } {
  const totalInches = cm / CM_PER_INCH
  const feet = Math.floor(totalInches / 12)
  return { feet, inches: totalInches - feet * 12 }
}

/** BMI = kg / m². Returns 0 for missing or non-positive input. */
export function calculateBmi(weightKg: number, heightCm: number): number {
  if (!(weightKg > 0) || !(heightCm > 0)) return 0
  const metres = heightCm / 100
  return weightKg / (metres * metres)
}

export function categoryFor(bmi: number): BmiCategory {
  return CATEGORIES.find((c) => bmi >= c.min && bmi < c.max) ?? CATEGORIES[CATEGORIES.length - 1]
}

/** Invert BMI for a fixed height: the weight range landing in the healthy band. */
export function healthyWeightRange(heightCm: number): { minKg: number; maxKg: number } {
  if (!(heightCm > 0)) return { minKg: 0, maxKg: 0 }
  const metresSquared = (heightCm / 100) ** 2
  return { minKg: HEALTHY_BMI.min * metresSquared, maxKg: HEALTHY_BMI.max * metresSquared }
}

/** BMI Prime: the ratio to the healthy upper bound (25). */
export function bmiPrime(bmi: number): number {
  return bmi / 25
}

/** kg above (+) or below (−) the healthy band; 0 when already inside it. */
export function deltaToHealthy(weightKg: number, heightCm: number): number {
  const { minKg, maxKg } = healthyWeightRange(heightCm)
  if (!(weightKg > 0) || !(heightCm > 0)) return 0
  if (weightKg > maxKg) return weightKg - maxKg
  if (weightKg < minKg) return weightKg - minKg
  return 0
}

/** Single entry point the UI uses. Returns null when input is incomplete. */
export function evaluate(weightKg: number, heightCm: number): BmiResult | null {
  const bmi = calculateBmi(weightKg, heightCm)
  if (!bmi) return null
  return {
    bmi,
    category: categoryFor(bmi),
    prime: bmiPrime(bmi),
    healthyRange: healthyWeightRange(heightCm),
    deltaKg: deltaToHealthy(weightKg, heightCm),
  }
}
