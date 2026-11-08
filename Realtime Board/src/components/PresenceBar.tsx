import { usePresence } from '../hooks/usePresence'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}

/**
 * One avatar per HUMAN. Someone with three tabs open gets one avatar with a
 * tab count, not three — which is precisely the illusion the old Workflow
 * Board's simulated-collaborator engine created and this app exists to stop
 * faking.
 */
export function PresenceBar() {
  const { me, others } = usePresence()
  const everyone = me ? [me, ...others] : others
  if (everyone.length === 0) return null

  return (
    <div className="presence" aria-label="People on this board">
      {everyone.map((person) => (
        <span
          className={`avatar${person.isSelf ? ' avatar--self' : ''}`}
          key={person.userId}
          style={{ background: person.color }}
          title={`${person.name}${person.isSelf ? ' (you)' : ''}${
            person.tabs > 1 ? ` — ${person.tabs} tabs` : ''
          }`}
        >
          {initials(person.name)}
          {person.tabs > 1 ? <em className="avatar__tabs">{person.tabs}</em> : null}
        </span>
      ))}
    </div>
  )
}
