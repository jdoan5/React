interface Props {
  latencyMs: number
  failureRate: number
  onChange: (next: { latencyMs: number; failureRate: number }) => void
}

/**
 * The chaos knobs, and the reason optimistic sync is demoable with no account.
 *
 * Latency makes the gap between optimistic apply and server confirmation
 * visible — cards show "saving…" while the write is in the air. Failure rate
 * makes rollback something you can watch: turn it up, drag a card, and see it
 * snap back when the write is rejected.
 *
 * Changing either remounts the provider, because the adapter is created once
 * per board and its clientId has to stay stable for the queue to make sense.
 */
export function DemoControls({ latencyMs, failureRate, onChange }: Props) {
  return (
    <div className="demo-controls">
      <label>
        Latency
        <input
          max={2000}
          min={0}
          onChange={(e) => onChange({ latencyMs: Number(e.target.value), failureRate })}
          step={50}
          type="range"
          value={latencyMs}
        />
        <output>{latencyMs} ms</output>
      </label>
      <label>
        Failure rate
        <input
          max={100}
          min={0}
          onChange={(e) => onChange({ latencyMs, failureRate: Number(e.target.value) / 100 })}
          step={5}
          type="range"
          value={Math.round(failureRate * 100)}
        />
        <output>{Math.round(failureRate * 100)}%</output>
      </label>
      <p className="demo-controls__hint">
        Turn failure up and drag a card: the move applies instantly, retries with backoff, then
        rolls back if it never lands.
      </p>
    </div>
  )
}
