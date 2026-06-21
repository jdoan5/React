import { useState, type CSSProperties } from 'react'

interface Props {
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Strength colour used for the focus ring. */
  accentColor?: string
}

export function PasswordInput({ id, label, value, onChange, placeholder, accentColor }: Props) {
  const [show, setShow] = useState(false)
  const style = accentColor ? ({ '--accent': accentColor } as CSSProperties) : undefined

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="pw-input" style={style}>
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className="pw-input__toggle"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? '🙈' : '👁️'}
        </button>
      </div>
    </div>
  )
}
