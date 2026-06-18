import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

interface Props {
  onAdd: (title: string) => void
}

/** "Add another list" composer shown at the right end of the board. */
export function AddColumn({ onAdd }: Props) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) ref.current?.focus()
  }, [open])

  function submit() {
    const value = title.trim()
    if (!value) return
    onAdd(value)
    setTitle('')
    setOpen(false)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') submit()
    else if (event.key === 'Escape') {
      setOpen(false)
      setTitle('')
    }
  }

  if (!open) {
    return (
      <button className="add-column" onClick={() => setOpen(true)}>
        + Add another list
      </button>
    )
  }

  return (
    <div className="add-column add-column--open">
      <input
        ref={ref}
        value={title}
        placeholder="List title…"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="composer__actions">
        <button className="btn btn--primary" onClick={submit}>
          Add list
        </button>
        <button className="btn btn--ghost" onClick={() => setOpen(false)} aria-label="Cancel">
          ✕
        </button>
      </div>
    </div>
  )
}
