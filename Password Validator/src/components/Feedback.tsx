interface Props {
  warnings: string[]
  suggestions: string[]
}

export function Feedback({ warnings, suggestions }: Props) {
  if (warnings.length === 0 && suggestions.length === 0) return null

  return (
    <div className="feedback">
      {warnings.map((w, i) => (
        <p key={`w-${i}`} className="feedback__warn">
          ⚠️ {w}
        </p>
      ))}
      {suggestions.map((s, i) => (
        <p key={`s-${i}`} className="feedback__tip">
          💡 {s}
        </p>
      ))}
    </div>
  )
}
