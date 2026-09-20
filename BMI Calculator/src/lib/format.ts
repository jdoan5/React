import { cmToFtIn, kgToLb } from './bmi'
import type { UnitSystem } from '../types'

export function formatBmi(n: number): string {
  return n.toFixed(1)
}

export function formatKg(kg: number): string {
  return `${kg.toFixed(1)} kg`
}

export function formatLb(kg: number): string {
  return `${kgToLb(kg).toFixed(1)} lb`
}

/** Weight in the user's chosen units. */
export function formatWeight(kg: number, unit: UnitSystem): string {
  return unit === 'metric' ? formatKg(kg) : formatLb(kg)
}

/** Height in the user's chosen units. */
export function formatHeight(cm: number, unit: UnitSystem): string {
  if (unit === 'metric') return `${cm.toFixed(0)} cm`
  const { feet, inches } = cmToFtIn(cm)
  return `${feet}′ ${inches.toFixed(0)}″`
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
