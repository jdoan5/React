import { usePasswordGenerator } from '../hooks/usePasswordGenerator'
import { useClipboard } from '../hooks/useClipboard'
import { GENERATOR_LENGTH } from '../constants'

interface Props {
  onUse: (password: string) => void
}

const BOOL_OPTIONS = [
  ['lowercase', 'a-z'],
  ['uppercase', 'A-Z'],
  ['numbers', '0-9'],
  ['symbols', '!@#'],
  ['avoidAmbiguous', 'No look-alikes'],
] as const

export function Generator({ onUse }: Props) {
  const { options, password, regenerate, updateOption } = usePasswordGenerator()
  const { copied, copy } = useClipboard()

  return (
    <section className="card gen">
      <h2 className="card__title">Generate a strong one</h2>

      <div className="gen__output">
        <code className="gen__pw">{password || '—'}</code>
        <div className="gen__actions">
          <button className="icon-btn" onClick={regenerate} aria-label="Regenerate" title="Regenerate">
            ↻
          </button>
          <button className="icon-btn" onClick={() => copy(password)} aria-label="Copy" title="Copy">
            {copied ? '✓' : '⧉'}
          </button>
        </div>
      </div>

      <div className="gen__length">
        <label htmlFor="gen-length">Length</label>
        <input
          id="gen-length"
          type="range"
          min={GENERATOR_LENGTH.min}
          max={GENERATOR_LENGTH.max}
          value={options.length}
          onChange={(e) => updateOption('length', Number(e.target.value))}
        />
        <span className="gen__len-val">{options.length}</span>
      </div>

      <div className="gen__toggles">
        {BOOL_OPTIONS.map(([key, label]) => (
          <label key={key} className={`toggle${options[key] ? ' is-on' : ''}`}>
            <input
              type="checkbox"
              checked={options[key]}
              onChange={(e) => updateOption(key, e.target.checked)}
            />
            {label}
          </label>
        ))}
      </div>

      <button className="btn btn--primary gen__use" onClick={() => onUse(password)} disabled={!password}>
        Use this password ↑
      </button>
    </section>
  )
}
