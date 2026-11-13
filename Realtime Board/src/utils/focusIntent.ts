/**
 * "The user just navigated — put focus somewhere sensible when the next view
 * is ready."
 *
 * Switching boards, starting a new one or retrying all unmount the control
 * that was clicked, and focus silently falls to <body>: a keyboard or
 * screen-reader user is dropped at the top of the page with no idea what
 * happened. Navigation actions raise this request; the view that finishes
 * appearing next (the board's heading, or an error panel) takes it once.
 *
 * A request rather than "always focus on mount", so a first page load — when
 * the user has not asked to go anywhere — never has its focus moved. And it
 * expires: a request nothing consumed (say, a link opened in a new tab) must
 * not steal focus from some unrelated view minutes later.
 */
const TTL_MS = 15_000
let requestedAt = 0

export function requestFocus(): void {
  requestedAt = Date.now()
}

/** True at most once per request, and only while the request is fresh. */
export function takeFocusRequest(): boolean {
  const fresh = requestedAt !== 0 && Date.now() - requestedAt < TTL_MS
  requestedAt = 0
  return fresh
}

/**
 * A click that navigates THIS tab. Cmd/Ctrl/Shift/Alt-click or a middle click
 * opens the link elsewhere, and this tab has nothing to focus afterwards.
 */
export function isPlainClick(event: {
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
}): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}
