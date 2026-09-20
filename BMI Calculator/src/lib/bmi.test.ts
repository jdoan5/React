import { describe, it, expect } from 'vitest'
import {
  bmiPrime,
  calculateBmi,
  categoryFor,
  cmToFtIn,
  deltaToHealthy,
  evaluate,
  ftInToCm,
  healthyWeightRange,
  kgToLb,
  lbToKg,
} from './bmi'

describe('unit conversion', () => {
  it('converts pounds to kilograms', () => {
    expect(lbToKg(154)).toBeCloseTo(69.85, 2)
  })
  it('round-trips kg <-> lb', () => {
    expect(kgToLb(lbToKg(180))).toBeCloseTo(180, 10)
  })
  it('converts feet+inches to centimetres', () => {
    expect(ftInToCm(5, 9)).toBeCloseTo(175.26, 2)
    expect(ftInToCm(6, 0)).toBeCloseTo(182.88, 2)
  })
  it('round-trips cm <-> ft/in', () => {
    const { feet, inches } = cmToFtIn(175.26)
    expect(feet).toBe(5)
    expect(inches).toBeCloseTo(9, 6)
    expect(ftInToCm(feet, inches)).toBeCloseTo(175.26, 6)
  })
})

describe('calculateBmi', () => {
  it('computes kg / m²', () => {
    expect(calculateBmi(70, 175)).toBeCloseTo(22.86, 2)
    expect(calculateBmi(100, 200)).toBeCloseTo(25, 6)
  })
  it('returns 0 for missing or invalid input', () => {
    expect(calculateBmi(0, 175)).toBe(0)
    expect(calculateBmi(70, 0)).toBe(0)
    expect(calculateBmi(-70, 175)).toBe(0)
    expect(calculateBmi(Number.NaN, 175)).toBe(0)
  })
})

describe('categoryFor — WHO boundaries', () => {
  const cases: [number, string][] = [
    [16, 'underweight'],
    [18.4, 'underweight'],
    [18.5, 'normal'],
    [24.9, 'normal'],
    [25, 'overweight'],
    [29.9, 'overweight'],
    [30, 'obese1'],
    [34.9, 'obese1'],
    [35, 'obese2'],
    [39.9, 'obese2'],
    [40, 'obese3'],
    [65, 'obese3'],
  ]
  it.each(cases)('BMI %s -> %s', (bmi, id) => {
    expect(categoryFor(bmi).id).toBe(id)
  })
})

describe('healthyWeightRange', () => {
  it('inverts BMI for a given height', () => {
    const { minKg, maxKg } = healthyWeightRange(175)
    expect(minKg).toBeCloseTo(56.66, 1)
    expect(maxKg).toBeCloseTo(76.26, 1)
  })
  it('lands inside the healthy band at both ends', () => {
    const { minKg, maxKg } = healthyWeightRange(180)
    expect(categoryFor(calculateBmi(minKg, 180)).id).toBe('normal')
    expect(categoryFor(calculateBmi(maxKg, 180)).id).toBe('normal')
  })
  it('is zero for invalid height', () => {
    expect(healthyWeightRange(0)).toEqual({ minKg: 0, maxKg: 0 })
  })
})

describe('deltaToHealthy', () => {
  it('is positive when above the band', () => {
    expect(deltaToHealthy(90, 175)).toBeCloseTo(90 - 76.26, 1)
  })
  it('is negative when below the band', () => {
    expect(deltaToHealthy(50, 175)).toBeCloseTo(50 - 56.66, 1)
  })
  it('is exactly 0 inside the band', () => {
    expect(deltaToHealthy(70, 175)).toBe(0)
  })
})

describe('bmiPrime', () => {
  it('is 1 at the healthy upper bound', () => {
    expect(bmiPrime(25)).toBe(1)
  })
  it('is below 1 under it and above 1 over it', () => {
    expect(bmiPrime(20)).toBeLessThan(1)
    expect(bmiPrime(30)).toBeGreaterThan(1)
  })
})

describe('evaluate', () => {
  it('assembles a full result', () => {
    const r = evaluate(70, 175)
    expect(r).not.toBeNull()
    expect(r!.bmi).toBeCloseTo(22.86, 2)
    expect(r!.category.id).toBe('normal')
    expect(r!.deltaKg).toBe(0)
    expect(r!.healthyRange.maxKg).toBeGreaterThan(r!.healthyRange.minKg)
  })
  it('returns null when input is incomplete', () => {
    expect(evaluate(0, 175)).toBeNull()
    expect(evaluate(70, 0)).toBeNull()
  })
})
