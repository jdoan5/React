import type { Measurements } from '../types'

interface Props {
  measurements: Measurements
  onField: (key: keyof Measurements, value: string) => void
}

export function MeasurementForm({ measurements, onField }: Props) {
  const metric = measurements.unit === 'metric'

  return (
    <div className="form">
      <div className="field">
        <label className="field__label" htmlFor={metric ? 'cm' : 'ft'}>
          Height
        </label>
        {metric ? (
          <div className="input-wrap">
            <input
              id="cm"
              type="number"
              inputMode="decimal"
              min="50"
              max="260"
              step="0.1"
              value={measurements.cm}
              onChange={(e) => onField('cm', e.target.value)}
            />
            <span className="input-wrap__unit">cm</span>
          </div>
        ) : (
          <div className="input-row">
            <div className="input-wrap">
              <input
                id="ft"
                type="number"
                inputMode="numeric"
                min="1"
                max="8"
                step="1"
                value={measurements.ft}
                onChange={(e) => onField('ft', e.target.value)}
              />
              <span className="input-wrap__unit">ft</span>
            </div>
            <div className="input-wrap">
              <input
                id="inch"
                type="number"
                inputMode="decimal"
                min="0"
                max="11.9"
                step="0.1"
                value={measurements.inch}
                onChange={(e) => onField('inch', e.target.value)}
                aria-label="Height in inches"
              />
              <span className="input-wrap__unit">in</span>
            </div>
          </div>
        )}
      </div>

      <div className="field">
        <label className="field__label" htmlFor={metric ? 'kg' : 'lb'}>
          Weight
        </label>
        <div className="input-wrap">
          <input
            id={metric ? 'kg' : 'lb'}
            type="number"
            inputMode="decimal"
            min="1"
            max={metric ? '400' : '880'}
            step="0.1"
            value={metric ? measurements.kg : measurements.lb}
            onChange={(e) => onField(metric ? 'kg' : 'lb', e.target.value)}
          />
          <span className="input-wrap__unit">{metric ? 'kg' : 'lb'}</span>
        </div>
      </div>
    </div>
  )
}
