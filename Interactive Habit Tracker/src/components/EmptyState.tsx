interface Props {
  onAdd: () => void
}

export function EmptyState({ onAdd }: Props) {
  return (
    <div className="empty">
      <div className="empty__art" aria-hidden>🌱</div>
      <h2>Start your first habit</h2>
      <p>Track daily routines, build streaks, and watch your consistency grow over time.</p>
      <button className="btn btn--primary" onClick={onAdd}>
        + New habit
      </button>
    </div>
  )
}
