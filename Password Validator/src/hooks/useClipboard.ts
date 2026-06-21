import { useCallback, useEffect, useRef, useState } from 'react'

/** Copy text to the clipboard with a transient "copied!" flag. */
export function useClipboard(resetMs = 1500) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  const copy = useCallback(
    async (text: string) => {
      if (!text) return false
      try {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setCopied(false), resetMs)
        return true
      } catch {
        return false
      }
    },
    [resetMs],
  )

  useEffect(() => () => window.clearTimeout(timer.current), [])

  return { copied, copy }
}
