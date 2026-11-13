import { useEffect, useRef } from 'react'
import type { RouteAction } from '../hooks/useBoardRoute'
import { takeFocusRequest } from '../utils/focusIntent'

interface Props {
  title: string
  body?: string
  action?: RouteAction
}

/**
 * Stands in for the board while it is being made, or when it cannot be
 * opened. Its text is spoken through the app-wide Announcer rather than a live
 * region of its own (see utils/announcer.ts). When the user's last action led
 * here — a failed "New board" or "Try again" — focus lands on the heading.
 */
export function BoardMessage({ title, body, action }: Props) {
  const heading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    // Only a panel with something to DO takes focus; the transient "Creating
    // your board…" panel leaves the request for the board that follows it.
    if (action && takeFocusRequest()) heading.current?.focus()
  }, [action])

  return (
    <section className="gate">
      <h2 className="gate__title" ref={heading} tabIndex={-1}>
        {title}
      </h2>
      {body ? <p className="gate__body">{body}</p> : null}
      {action ? (
        <button className="btn btn--primary" onClick={action.run} type="button">
          {action.label}
        </button>
      ) : null}
    </section>
  )
}
