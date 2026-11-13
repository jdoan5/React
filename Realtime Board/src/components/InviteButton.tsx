import { useEffect, useRef, useState } from 'react'
import { useInvite } from '../hooks/useInvite'

type State =
  | { readonly kind: 'idle' }
  | { readonly kind: 'working' }
  | { readonly kind: 'copied' }
  /** The clipboard was refused (permissions, an iframe): show the link to copy by hand. */
  | { readonly kind: 'manual'; readonly link: string }
  | { readonly kind: 'error'; readonly message: string }

export function InviteButton() {
  const { available, getLink } = useInvite()
  const [state, setState] = useState<State>({ kind: 'idle' })
  const manualInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Copying was refused: hand the link over pre-selected, so one keystroke
    // copies it — and so a keyboard user lands on it instead of losing track.
    if (state.kind !== 'manual') return
    manualInput.current?.focus()
    manualInput.current?.select()
  }, [state])

  useEffect(() => {
    if (state.kind !== 'copied') return
    const timer = setTimeout(() => setState({ kind: 'idle' }), 2000)
    return () => clearTimeout(timer)
  }, [state])

  if (!available) return null

  async function copy() {
    setState({ kind: 'working' })
    let link: string | null
    try {
      link = await getLink()
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
      return
    }
    if (!link) {
      setState({ kind: 'error', message: 'This board has no invite link.' })
      return
    }
    try {
      await navigator.clipboard.writeText(link)
      setState({ kind: 'copied' })
    } catch {
      setState({ kind: 'manual', link })
    }
  }

  return (
    <div className="invite">
      <button
        className="btn btn--primary"
        disabled={state.kind === 'working'}
        onClick={() => void copy()}
        type="button"
      >
        {state.kind === 'copied' ? 'Link copied' : 'Copy invite link'}
      </button>
      {state.kind === 'manual' ? (
        <input
          aria-label="Invite link"
          className="invite__manual"
          onFocus={(e) => e.currentTarget.select()}
          readOnly
          ref={manualInput}
          value={state.link}
        />
      ) : null}
      <span aria-live="polite" className="invite__status">
        {state.kind === 'copied' ? 'Anyone with this link can join and edit the board.' : null}
        {state.kind === 'manual'
          ? 'Your browser blocked copying. The link is selected — press Ctrl+C (⌘C on a Mac).'
          : null}
        {state.kind === 'error' ? state.message : null}
      </span>
    </div>
  )
}
