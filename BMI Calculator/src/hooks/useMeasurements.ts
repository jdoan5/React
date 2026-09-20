import { useCallback, useMemo } from 'react'
import { useLocalStorage } from './useLocalStorage'
import { DEFAULT_MEASUREMENTS, STORAGE_KEYS } from '../constants'
import { cmToFtIn, ftInToCm, kgToLb, lbToKg } from '../lib/bmi'
import type { Measurements, UnitSystem } from '../types'

const num = (s: string): number => {
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

/**
 * Form state for height/weight. Raw strings are kept per unit system so typing
 * never round-trips lossily, and `canonical` exposes the metric values the BMI
 * maths actually needs.
 */
export function useMeasurements() {
  const [measurements, setMeasurements] = useLocalStorage<Measurements>(
    STORAGE_KEYS.measurements,
    DEFAULT_MEASUREMENTS,
  )

  const setField = useCallback(
    (key: keyof Measurements, value: string) => {
      setMeasurements((prev) => ({ ...prev, [key]: value }))
    },
    [setMeasurements],
  )

  /** Switching units carries the current numbers across rather than clearing them. */
  const setUnit = useCallback(
    (unit: UnitSystem) => {
      setMeasurements((prev) => {
        if (prev.unit === unit) return prev
        if (unit === 'imperial') {
          const { feet, inches } = cmToFtIn(num(prev.cm))
          return {
            ...prev,
            unit,
            ft: String(feet),
            inch: inches.toFixed(1),
            lb: kgToLb(num(prev.kg)).toFixed(1),
          }
        }
        return {
          ...prev,
          unit,
          cm: ftInToCm(num(prev.ft), num(prev.inch)).toFixed(1),
          kg: lbToKg(num(prev.lb)).toFixed(1),
        }
      })
    },
    [setMeasurements],
  )

  const canonical = useMemo(
    () =>
      measurements.unit === 'metric'
        ? { heightCm: num(measurements.cm), weightKg: num(measurements.kg) }
        : {
            heightCm: ftInToCm(num(measurements.ft), num(measurements.inch)),
            weightKg: lbToKg(num(measurements.lb)),
          },
    [measurements],
  )

  const reset = useCallback(() => setMeasurements(DEFAULT_MEASUREMENTS), [setMeasurements])

  return { measurements, setField, setUnit, canonical, reset }
}
