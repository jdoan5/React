import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { ID } from '../types'

interface Props {
  columnId: ID
  onAdd: (columnId: ID, title: string) => void
}

/** Inline card composer. Stays open after adding so you can add several quickly. */
export function AddCard({ columnId, onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) ref.current?.focus()
  }, [open])

  function submit() {
    const value = title.trim()
    if (!value) return
    onAdd(columnId, value)
    setTitle('')
    ref.current?.focus()
  }

  function close() {
    setOpen(false)
    setTitle('')
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submit()
    } else if (event.key === 'Escape') {
      close()
    }
  }

  if (!open) {
    return (
      <button className="column__add" onClick={() => setOpen(true)}>
        + Add a card
      </button>
    )
  }

  return (
    <div className="composer">
      <textarea
        ref={ref}
        value={title}
        placeholder="Enter a title for this card…"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
      />
      <div className="composer__actions">
        <button className="btn btn--primary" onClick={submit}>
          Add card
        </button>
        <button className="btn btn--ghost" onClick={close} aria-label="Cancel">
          ✕
        </button>
      </div>
    </div>
  )
}
