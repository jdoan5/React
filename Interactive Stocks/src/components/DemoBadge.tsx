export function DemoBadge() {
  return (
    <span
      className="demo-badge"
      title="No API key configured — showing deterministic demo data. Add a massive.com key to see live prices."
    >
      <span className="demo-badge__dot" /> Demo data
    </span>
  )
}
