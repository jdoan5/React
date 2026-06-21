import { useState } from 'react'
import { usePasswordStrength } from './hooks/usePasswordStrength'
import { STRENGTH_COLORS } from './constants'
import { PasswordInput } from './components/PasswordInput'
import { StrengthMeter } from './components/StrengthMeter'
import { RequirementList } from './components/RequirementList'
import { Feedback } from './components/Feedback'
import { Generator } from './components/Generator'

export default function App() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const result = usePasswordStrength(password)

  const active = password.length > 0
  const color = STRENGTH_COLORS[result.score]
  const confirmState = confirm.length === 0 ? 'empty' : confirm === password ? 'match' : 'mismatch'

  return (
    <div className="app">
      <header className="hero">
        <h1>
          <span aria-hidden>🔒</span> Password Validator
        </h1>
        <p>See how strong a password really is — or generate one that isn’t worth guessing.</p>
      </header>

      <main className="layout">
        <section className="card">
          <PasswordInput
            id="password"
            label="Test a password"
            value={password}
            onChange={setPassword}
            placeholder="Start typing…"
            accentColor={active ? color : undefined}
          />

          <StrengthMeter
            score={result.score}
            label={result.label}
            entropyBits={result.entropyBits}
            crackTime={result.crackTime}
            active={active}
          />

          <RequirementList rules={result.rules} />
          {active && <Feedback warnings={result.warnings} suggestions={result.suggestions} />}

          <PasswordInput
            id="confirm"
            label="Confirm password"
            value={confirm}
            onChange={setConfirm}
            placeholder="Re-enter to check it matches"
          />
          {confirmState !== 'empty' && (
            <p className={`confirm confirm--${confirmState}`}>
              {confirmState === 'match' ? '✓ Passwords match' : '✕ Passwords don’t match'}
            </p>
          )}
        </section>

        <Generator
          onUse={(pw) => {
            setPassword(pw)
            setConfirm('')
          }}
        />
      </main>

      <footer className="foot">
        🛡️ Everything runs locally in your browser — no password is ever sent anywhere.
      </footer>
    </div>
  )
}
