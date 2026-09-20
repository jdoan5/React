import type { BmiCategory, Measurements } from './types'

/** WHO adult BMI classification. */
export const CATEGORIES: BmiCategory[] = [
  { id: 'underweight', label: 'Underweight', min: 0, max: 18.5, color: '#38bdf8' },
  { id: 'normal', label: 'Healthy weight', min: 18.5, max: 25, color: '#22c55e' },
  { id: 'overweight', label: 'Overweight', min: 25, max: 30, color: '#eab308' },
  { id: 'obese1', label: 'Obesity class I', min: 30, max: 35, color: '#f97316' },
  { id: 'obese2', label: 'Obesity class II', min: 35, max: 40, color: '#ef4444' },
  { id: 'obese3', label: 'Obesity class III', min: 40, max: Infinity, color: '#b91c1c' },
]

/** The band conventionally reported as a healthy weight. */
export const HEALTHY_BMI = { min: 18.5, max: 24.9 }

/** Visible span of the gauge. */
export const GAUGE = { min: 15, max: 40 }

export const STORAGE_KEYS = {
  measurements: 'bmi-calculator:measurements:v1',
  history: 'bmi-calculator:history:v1',
}

export const DEFAULT_MEASUREMENTS: Measurements = {
  unit: 'metric',
  cm: '175',
  kg: '70',
  ft: '5',
  inch: '9',
  lb: '154',
}

export const MAX_HISTORY = 10
