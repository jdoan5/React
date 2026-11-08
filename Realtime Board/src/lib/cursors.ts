/**
 * Live cursors and drag ghosts — merging incoming pings, evicting stale ones by TTL,
 * clamping coordinates, and deciding when it is time to send.
 *
 * WHY THIS IS A SEPARATE MODULE FROM THE SNAPSHOT/QUEUE PATH
 * ----------------------------------------------------------
 * Deliberately separate, and the separation is the point: a 20 Hz cursor stream must
 * never re-project the board.
 *
 * The snapshot and the command queue are authoritative, reconciled state, and every
 * write to them re-runs project() over every column. Cursor traffic is the opposite —
 * ephemeral, lossy, and roughly twenty pings per second per collaborator. Routing it
 * through the same reducer would re-project the whole board on every mouse move, which
 * is the usual way a multiplayer board ends up janky while looking correct.
 *
 * So nothing here ever reaches the state that feeds project(). This map lives in its
 * own store, which only CursorLayer subscribes to. That is also why every function
 * below is allowed to simply DISCARD input instead of queueing or retrying it: a lost
 * cursor ping costs one stale frame, and the next ping is 50 ms away.
 *
 * Returning the SAME object reference when nothing changed is therefore load-bearing,
 * not a micro-optimisation — it is what lets the store skip a render on the many pings
 * that carry no news.
 *
 * PURITY
 * ------
 * No clock and no randomness in this file. `now` is passed in to everything that needs
 * it, which is what makes TTL eviction and the throttle testable without fake timers
 * and lets the same code run over a replayed trace.
 *
 * TRUST
 * -----
 * Every field of an incoming CursorPing was produced by another browser and arrived
 * over Broadcast, so it is untrusted input: coordinates may be out of range or NaN,
 * timestamps may be duplicated, late, or from a clock that disagrees with ours. The
 * guards below are about that, not about defending against our own callers.
 */

// `ID` comes from types.ts, not from the adapter: adapter.ts imports it but does not
// re-export it, and that file is the frozen contract, so it is not ours to widen.
import type { CursorPing } from '../sync/adapter'
import type { ID } from '../types'

/**
 * How long a cursor survives without a fresh ping. Long enough to ride out a brief
 * socket hiccup without the cursor blinking, short enough that someone who closed
 * their laptop stops haunting the board. Broadcast has no "leave" event we can trust
 * for this — presence does, but presence is a different, slow transport — so expiry is
 * how a departed cursor actually disappears.
 */
export const CURSOR_TTL_MS = 5_000

/**
 * Floor on the gap between two sends: 50 ms, i.e. 20 Hz, which is smooth to the eye
 * and well under the rate at which mousemove fires.
 *
 * Presence is the wrong transport for this and the throttle is why. Its own docs name
 * cursor-per-mousemove as the anti-pattern, and the hard cap is 5 presence calls per
 * client per 30 seconds on every plan. Cursors go over Broadcast instead, throttled
 * here by the caller asking shouldSend() first.
 */
export const CURSOR_MIN_INTERVAL_MS = 50

/**
 * Pin one board-relative fraction into 0..1.
 *
 * ±Infinity needs no special case — Math.min/Math.max already place it at the right
 * end. NaN does: it has no position on the number line, so there is nothing to clamp
 * it TO. 0 is arbitrary but safe, and it is the choice that keeps the cursor inside
 * the board instead of letting `left: NaN%` through to the layer.
 */
function clampFraction(value: number): number {
  if (Number.isNaN(value)) return 0
  return Math.min(1, Math.max(0, value))
}

/**
 * A ping whose x and y are guaranteed to be real numbers in 0..1.
 *
 * WHY CLAMP RATHER THAN DROP. Both were on the table, and dropping is worse than it
 * first looks. A dropped ping leaves the cursor frozen at its last good position and
 * then silently expires by TTL, so a collaborator who is still right there reads as
 * having left the board — we would be lying about presence to punish a bad coordinate.
 * Clamping keeps a live person visible, pinned to the nearest edge. The clamp is also
 * a real defence and not just tidiness: unclamped, one buggy or hostile client paints
 * a cursor anywhere on the page, including over the UI, by sending x = 50. Nothing
 * here is persisted or reconciled, so a clamped coordinate cannot corrupt anything
 * downstream — the worst case is a cursor parked on an edge.
 *
 * Returns the input itself when it is already in range, so the common case allocates
 * nothing and compares equal by reference.
 */
export function clampCursor(ping: CursorPing): CursorPing {
  const x = clampFraction(ping.x)
  const y = clampFraction(ping.y)
  // NaN !== NaN, so a NaN coordinate always falls through to the copy below.
  if (x === ping.x && y === ping.y) return ping
  return { ...ping, x, y }
}

/**
 * Fold one incoming ping into the cursor map.
 *
 * The whole ping replaces the held one rather than being merged field by field, which
 * is what makes a drag ghost end correctly: `draggingCardId: null` on a newer ping
 * clears the ghost while leaving the cursor itself on the board.
 *
 * Returns the same map reference whenever the ping carries no news.
 */
export function mergeCursor(
  map: Readonly<Record<ID, CursorPing>>,
  ping: CursorPing,
): Readonly<Record<ID, CursorPing>> {
  // An unorderable timestamp is the one thing clamping cannot rescue. It can neither
  // be compared against the held ping nor aged out by pruneCursors — `now - NaN` is
  // never greater than the TTL — so storing it would pin that cursor on the board
  // forever. Dropping is the only safe answer, and dropping a ping is free here.
  if (!Number.isFinite(ping.at)) return map

  const held = map[ping.userId]

  // Broadcast guarantees neither ordering nor de-duplication, so both a late packet
  // and a re-delivered copy of one we already applied arrive here. `<=` rather than
  // `<` covers the second case: an equal `at` is treated as stale, which makes
  // redelivery a genuine no-op instead of a pointless re-render.
  if (held !== undefined && ping.at <= held.at) return map

  // Clamping belongs HERE, not only at the call site: merge is the only door into the
  // map, so doing it on the way in makes the 0..1 invariant structural. Everything
  // reading the map afterwards — prune, the render layer — can trust it.
  return { ...map, [ping.userId]: clampCursor(ping) }
}

/**
 * Drop every cursor whose last ping is older than `ttlMs`.
 *
 * Age is `now - ping.at`, with `now` supplied by the caller. Eviction is on strictly
 * greater than the TTL, so a cursor sitting exactly on the boundary survives one more
 * pass: a timer that fires a tick late should not blink an active collaborator off the
 * board.
 *
 * A future-dated ping (the sender's clock runs ahead of ours) has a negative age and
 * is kept, which is the safe direction — it ages in normally once our clock catches
 * up. Note the limit this inherits from the contract: `at` is a SENDER clock, so TTL
 * is only as accurate as the two clocks' agreement. A client minutes ahead of us
 * lingers minutes past leaving. Fixing that properly needs a receiver-stamped arrival
 * time, which CursorPing has nowhere to put.
 */
export function pruneCursors(
  map: Readonly<Record<ID, CursorPing>>,
  now: number,
  ttlMs: number = CURSOR_TTL_MS,
): Readonly<Record<ID, CursorPing>> {
  // A broken clock would make every age NaN and silently wipe the board of cursors.
  // Changing nothing is the better failure.
  if (!Number.isFinite(now)) return map

  const held = Object.entries(map)
  const survivors = held.filter(([, ping]) => now - ping.at <= ttlMs)
  if (survivors.length === held.length) return map
  return Object.fromEntries(survivors)
}

/**
 * Is it time to broadcast our own cursor again? A pure predicate over the clock — the
 * caller owns the actual send, so this file never touches the adapter.
 *
 * Both of the odd cases below resolve towards sending. That asymmetry is on purpose:
 * an extra ping costs one packet on a lossy channel, while wrongly withholding one
 * freezes our cursor on everyone else's screen.
 */
export function shouldSend(
  lastSentAt: number,
  now: number,
  minIntervalMs: number = CURSOR_MIN_INTERVAL_MS,
): boolean {
  if (!Number.isFinite(now)) return false

  // 0 is the store's "never sent yet" sentinel. It must pass regardless of what `now`
  // is, or the first mousemove after joining is swallowed and our cursor does not
  // appear to anyone until the second one. A negative or non-finite value means the
  // same thing: no usable record of a previous send.
  if (!Number.isFinite(lastSentAt) || lastSentAt <= 0) return true

  const gap = now - lastSentAt

  // A clock that went backwards — an NTP correction, a laptop waking — makes the gap
  // negative and the real elapsed time unknowable. Send.
  if (gap < 0) return true

  // `>=`, so a timer firing exactly on the boundary passes. With `>` a 50 ms interval
  // would quietly become 51 ms and the stream would sit just under its target rate.
  return gap >= minIntervalMs
}
