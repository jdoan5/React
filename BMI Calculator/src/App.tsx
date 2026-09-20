import { useMemo } from 'react'
import { evaluate } from './lib/bmi'
import { useMeasurements } from './hooks/useMeasurements'
import { useHistory } from './hooks/useHistory'
import { UnitToggle } from './components/UnitToggle'
import { MeasurementForm } from './components/MeasurementForm'
import { ResultCard } from './components/ResultCard'
import { HistoryList } from './components/HistoryList'

export default function App() {
  const { measurements, setField, setUnit, canonical, reset } = useMeasurements()
  const { entries, add, remove, clear } = useHistory()

  const result = useMemo(
    () => evaluate(canonical.weightKg, canonical.heightCm),
    [canonical],
  )

  return (
    <div className="app">
      <header className="hero">
        <h1>
          <span aria-hidden>⚖️</span> BMI Calculator
        </h1>
        <p>
          Body Mass Index with WHO categories, the healthy weight range for your height, and a
          saved history.
        </p>
      </header>

      <main className="layout">
        <section className="card">
          <UnitToggle value={measurements.unit} onChange={setUnit} />
          <MeasurementForm measurements={measurements} onField={setField} />
          <div className="actions">
            <button
              className="btn btn--primary"
              disabled={!result}
              onClick={() =>
                result &&
                add({
                  bmi: result.bmi,
                  categoryId: result.category.id,
                  weightKg: canonical.weightKg,
                  heightCm: canonical.heightCm,
                })
              }
            >
              Save reading
            </button>
            <button className="btn btn--ghost" onClick={reset}>
              Reset
            </button>
          </div>
        </section>

        <ResultCard result={result} unit={measurements.unit} />
      </main>

      <HistoryList
        entries={entries}
        unit={measurements.unit}
        onRemove={remove}
        onClear={clear}
      />

      <footer className="foot">
        <strong>BMI is a screening tool, not a diagnosis.</strong> It can&apos;t tell muscle from
        fat, and doesn&apos;t account for age, sex, ethnicity or body composition — muscular
        athletes often read as &ldquo;overweight&rdquo;. Talk to a healthcare professional about
        what&apos;s right for you.
      </footer>
    </div>
  )
}
