import { describe, expect, it } from 'vitest'
import type { CursorPing } from '../sync/adapter'
import {
  CURSOR_MIN_INTERVAL_MS,
  CURSOR_TTL_MS,
  clampCursor,
  mergeCursor,
  pruneCursors,
  shouldSend,
} from './cursors'

/** A well-formed ping in the middle of the board, with only `at` worth varying. */
function ping(userId: string, at: number, over: Partial<CursorPing> = {}): CursorPing {
  return { userId, x: 0.5, y: 0.5, draggingCardId: null, at, ...over }
}

function mapOf(...pings: readonly CursorPing[]): Readonly<Record<string, CursorPing>> {
  return Object.fromEntries(pings.map((p) => [p.userId, p]))
}

describe('clampCursor — coordinates are untrusted input', () => {
  it('leaves an in-range ping untouched, by reference, so the common case allocates nothing', () => {
    const inRange = ping('ada', 1000, { x: 0, y: 1 })
    expect(clampCursor(inRange)).toBe(inRange)
    expect(clampCursor(ping('ada', 1000, { x: 0.25, y: 0.75 }))).toEqual(
      ping('ada', 1000, { x: 0.25, y: 0.75 }),
    )
  })

  it('pins x and y into 0..1 rather than letting a cursor paint across the page', () => {
    expect(clampCursor(ping('ada', 1, { x: 50, y: -3 }))).toEqual(
      ping('ada', 1, { x: 1, y: 0 }),
    )
  })

  it('maps NaN to 0, because NaN has no position to clamp towards', () => {
    const clamped = clampCursor(ping('ada', 1, { x: Number.NaN, y: Number.NaN }))
    expect(clamped.x).toBe(0)
    expect(clamped.y).toBe(0)
  })

  it('sends ±Infinity to the nearest edge instead of to 0', () => {
    const clamped = clampCursor(
      ping('ada', 1, { x: Number.POSITIVE_INFINITY, y: Number.NEGATIVE_INFINITY }),
    )
    expect(clamped.x).toBe(1)
    expect(clamped.y).toBe(0)
  })

  it('carries the rest of the ping through unchanged while clamping', () => {
    const clamped = clampCursor(ping('ada', 42, { x: 9, draggingCardId: 'card-7' }))
    expect(clamped).toEqual({
      userId: 'ada',
      x: 1,
      y: 0.5,
      draggingCardId: 'card-7',
      at: 42,
    })
  })

  it('never mutates its input', () => {
    const dirty = ping('ada', 1, { x: 9, y: -9 })
    clampCursor(dirty)
    expect(dirty.x).toBe(9)
    expect(dirty.y).toBe(-9)
  })
})

describe('mergeCursor — out-of-order and duplicate delivery', () => {
  it('stores a cursor for a user not yet in the map', () => {
    const fresh = ping('ada', 1000)
    expect(mergeCursor({}, fresh)).toEqual(mapOf(fresh))
  })

  it('replaces a cursor when the ping has a newer `at`', () => {
    const before = mapOf(ping('ada', 1000, { x: 0.1 }))
    const after = mergeCursor(before, ping('ada', 1001, { x: 0.9 }))
    expect(after['ada']?.x).toBe(0.9)
    expect(after['ada']?.at).toBe(1001)
  })

  it('ignores a ping older than the stored cursor — Broadcast does not order packets', () => {
    const held = ping('ada', 1000, { x: 0.1 })
    const after = mergeCursor(mapOf(held), ping('ada', 999, { x: 0.9 }))
    expect(after['ada']).toBe(held)
  })

  it('returns the same map reference for a stale ping, so the store skips the render', () => {
    const before = mapOf(ping('ada', 1000))
    expect(mergeCursor(before, ping('ada', 999))).toBe(before)
  })

  it('treats an equal `at` as stale, making a re-delivered duplicate a true no-op', () => {
    const before = mapOf(ping('ada', 1000, { x: 0.1 }))
    expect(mergeCursor(before, ping('ada', 1000, { x: 0.9 }))).toBe(before)
  })

  it('discards a ping with a non-finite `at`, which could never be aged out again', () => {
    const before = mapOf(ping('ada', 1000))
    expect(mergeCursor(before, ping('ada', Number.NaN))).toBe(before)
    expect(mergeCursor(before, ping('ada', Number.POSITIVE_INFINITY))).toBe(before)
    expect(mergeCursor({}, ping('bob', Number.NaN))).toEqual({})
  })

  it('clamps on the way in, so the 0..1 invariant holds for everything reading the map', () => {
    const after = mergeCursor({}, ping('ada', 1000, { x: 12, y: Number.NaN }))
    expect(after['ada']?.x).toBe(1)
    expect(after['ada']?.y).toBe(0)
  })

  it('still applies a newer ping that only repeats the position, because it renews the TTL', () => {
    const before = mapOf(ping('ada', 1000, { x: 0.5, y: 0.5 }))
    const after = mergeCursor(before, ping('ada', 2000, { x: 0.5, y: 0.5 }))
    expect(after).not.toBe(before)
    expect(after['ada']?.at).toBe(2000)
  })

  it('leaves other users untouched, by reference', () => {
    const bob = ping('bob', 500)
    const after = mergeCursor(mapOf(ping('ada', 1000), bob), ping('ada', 1001))
    expect(after['bob']).toBe(bob)
  })

  it('never mutates the input map', () => {
    const before = mapOf(ping('ada', 1000))
    mergeCursor(before, ping('ada', 2000))
    mergeCursor(before, ping('bob', 2000))
    expect(Object.keys(before)).toEqual(['ada'])
    expect(before['ada']?.at).toBe(1000)
  })

  it('keeps exactly one entry per user under a long stream of pings', () => {
    let map: Readonly<Record<string, CursorPing>> = {}
    for (let i = 1; i <= 200; i++) {
      map = mergeCursor(map, ping('ada', i, { x: i / 1000 }))
      map = mergeCursor(map, ping('bob', i, { x: i / 1000 }))
    }
    expect(Object.keys(map).sort()).toEqual(['ada', 'bob'])
    expect(map['ada']?.at).toBe(200)
  })
})

describe('mergeCursor — drag ghosts', () => {
  it('clears the ghost on a null draggingCardId without removing the cursor', () => {
    const dragging = mergeCursor({}, ping('ada', 1000, { draggingCardId: 'card-7' }))
    expect(dragging['ada']?.draggingCardId).toBe('card-7')

    const dropped = mergeCursor(dragging, ping('ada', 1001, { draggingCardId: null }))
    expect(dropped['ada']?.draggingCardId).toBeNull()
    expect(dropped['ada']?.userId).toBe('ada')
  })

  it('does not resurrect a ghost from an out-of-order drag ping', () => {
    const dropped = mergeCursor({}, ping('ada', 1001, { draggingCardId: null }))
    const late = mergeCursor(dropped, ping('ada', 1000, { draggingCardId: 'card-7' }))
    expect(late).toBe(dropped)
  })
})

describe('pruneCursors — TTL eviction with the clock passed in', () => {
  it('evicts a cursor older than the TTL and keeps a fresh one', () => {
    const now = 10_000
    const fresh = ping('ada', now - 100)
    const stale = ping('bob', now - CURSOR_TTL_MS - 1)
    expect(pruneCursors(mapOf(fresh, stale), now)).toEqual(mapOf(fresh))
  })

  it('returns the SAME object reference when nothing expired, so no re-render happens', () => {
    const before = mapOf(ping('ada', 9_900), ping('bob', 9_000))
    expect(pruneCursors(before, 10_000)).toBe(before)
  })

  it('keeps a cursor sitting exactly on the TTL boundary, so a late timer does not blink it', () => {
    const now = 10_000
    const onTheLine = mapOf(ping('ada', now - CURSOR_TTL_MS))
    expect(pruneCursors(onTheLine, now)).toBe(onTheLine)
    expect(pruneCursors(mapOf(ping('ada', now - CURSOR_TTL_MS - 1)), now)).toEqual({})
  })

  it('keeps surviving pings by reference and only rebuilds the map that changed', () => {
    const fresh = ping('ada', 9_999)
    const after = pruneCursors(mapOf(fresh, ping('bob', 1)), 10_000)
    expect(after['ada']).toBe(fresh)
    expect(after['bob']).toBeUndefined()
  })

  it('honours a caller-supplied ttlMs rather than the constant', () => {
    const before = mapOf(ping('ada', 9_800))
    expect(pruneCursors(before, 10_000, 100)).toEqual({})
    expect(pruneCursors(before, 10_000, 500)).toBe(before)
  })

  it('keeps a future-dated ping, because a skewed sender clock should age in, not vanish', () => {
    const before = mapOf(ping('ada', 20_000))
    expect(pruneCursors(before, 10_000)).toBe(before)
  })

  it('changes nothing on a non-finite `now` instead of wiping every cursor', () => {
    const before = mapOf(ping('ada', 9_999), ping('bob', 1))
    expect(pruneCursors(before, Number.NaN)).toBe(before)
  })

  it('returns the same reference for an empty map', () => {
    const empty = {}
    expect(pruneCursors(empty, 10_000)).toBe(empty)
  })

  it('is idempotent — pruning twice at the same instant changes nothing the second time', () => {
    const once = pruneCursors(mapOf(ping('ada', 9_999), ping('bob', 1)), 10_000)
    expect(pruneCursors(once, 10_000)).toBe(once)
  })

  it('never mutates the input map', () => {
    const before = mapOf(ping('ada', 1))
    pruneCursors(before, 10_000)
    expect(Object.keys(before)).toEqual(['ada'])
  })
})

describe('shouldSend — a pure predicate; the caller does the sending', () => {
  it('always allows the first send, where lastSentAt is the 0 sentinel', () => {
    expect(shouldSend(0, 0)).toBe(true)
    expect(shouldSend(0, 7)).toBe(true)
    expect(shouldSend(0, 1_762_000_000_000)).toBe(true)
  })

  it('rejects a second send inside the interval and allows one after it', () => {
    expect(shouldSend(1_000, 1_000 + CURSOR_MIN_INTERVAL_MS - 1)).toBe(false)
    expect(shouldSend(1_000, 1_000 + CURSOR_MIN_INTERVAL_MS + 1)).toBe(true)
  })

  it('allows a send exactly on the boundary, so 50 ms does not drift into 51 ms', () => {
    expect(shouldSend(1_000, 1_000 + CURSOR_MIN_INTERVAL_MS)).toBe(true)
  })

  it('honours a caller-supplied interval rather than the constant', () => {
    expect(shouldSend(1_000, 1_100, 200)).toBe(false)
    expect(shouldSend(1_000, 1_100, 100)).toBe(true)
    expect(shouldSend(1_000, 1_001, 0)).toBe(true)
  })

  it('allows a send when the clock jumped backwards, rather than freezing the cursor', () => {
    expect(shouldSend(5_000, 1_000)).toBe(true)
  })

  it('treats a non-finite or negative lastSentAt as never-sent', () => {
    expect(shouldSend(Number.NaN, 1_000)).toBe(true)
    expect(shouldSend(Number.POSITIVE_INFINITY, 1_000)).toBe(true)
    expect(shouldSend(-1, 1_000)).toBe(true)
  })

  it('declines to send on a non-finite now, which is the caller being broken', () => {
    expect(shouldSend(1_000, Number.NaN)).toBe(false)
    expect(shouldSend(0, Number.NaN)).toBe(false)
  })

  it('caps a 1 ms mousemove stream at the 20 Hz the interval names', () => {
    let lastSentAt = 0
    let sent = 0
    // Starts at 1 so the first send records a real timestamp rather than the sentinel.
    for (let now = 1; now <= 1_000; now++) {
      if (shouldSend(lastSentAt, now)) {
        sent++
        lastSentAt = now
      }
    }
    // One send on the first move, then one every 50 ms: 1, 51, 101, ... 951.
    expect(sent).toBe(20)
  })

  it('is a function of its arguments alone — same inputs, same answer, no clock inside', () => {
    expect(shouldSend(1_000, 1_049)).toBe(shouldSend(1_000, 1_049))
    expect(shouldSend(1_000, 1_050)).toBe(shouldSend(1_000, 1_050))
  })
})
