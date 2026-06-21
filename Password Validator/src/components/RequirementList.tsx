import type { RuleResult } from '../types'

interface Props {
  rules: RuleResult[]
}

export function RequirementList({ rules }: Props) {
  return (
    <ul className="reqs">
      {rules.map((rule) => (
        <li key={rule.id} className={`req ${rule.passed ? 'is-pass' : 'is-fail'}`}>
          <span className="req__icon" aria-hidden>
            {rule.passed ? '✓' : '○'}
          </span>
          {rule.label}
        </li>
      ))}
    </ul>
  )
}
