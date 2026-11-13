import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isPlainClick, requestFocus, takeFocusRequest } from './focusIntent'

describe('focus requests', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-05T09:00:00Z'))
    takeFocusRequest() // start every test with nothing pending
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('nothing to take before anything was requested — a first page load keeps its focus', () => {
    expect(takeFocusRequest()).toBe(false)
  })

  it('is taken exactly once', () => {
    requestFocus()
    expect(takeFocusRequest()).toBe(true)
    expect(takeFocusRequest()).toBe(false)
  })

  it('survives the time it takes to create and load a board', () => {
    requestFocus()
    vi.advanceTimersByTime(14_000)
    expect(takeFocusRequest()).toBe(true)
  })

  it('expires, so an unconsumed request cannot steal focus minutes later', () => {
    requestFocus()
    vi.advanceTimersByTime(15_000)
    expect(takeFocusRequest()).toBe(false)
  })

  it('a newer request replaces an older one', () => {
    requestFocus()
    vi.advanceTimersByTime(14_000)
    requestFocus()
    vi.advanceTimersByTime(10_000)
    expect(takeFocusRequest()).toBe(true)
  })
})

describe('isPlainClick', () => {
  const click = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }

  it('a plain left click navigates this tab', () => {
    expect(isPlainClick(click)).toBe(true)
  })

  it.each([
    ['⌘-click (new tab on a Mac)', { metaKey: true }],
    ['Ctrl-click (new tab)', { ctrlKey: true }],
    ['Shift-click (new window)', { shiftKey: true }],
    ['Alt-click (download)', { altKey: true }],
    ['middle click', { button: 1 }],
  ])('%s does not', (_name, change) => {
    expect(isPlainClick({ ...click, ...change })).toBe(false)
  })
})
