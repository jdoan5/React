/**
 * Backoff — how long a rejected command waits before the queue tries it again.
 *
 * WHY THIS EXISTS
 * ---------------
 * When `commit` throws a retryable `SyncRejection('unavailable')`, the envelope goes
 * back to `pending` with a `nextAttemptAt` in the future. This module is the only
 * thing that decides how far in the future.
 *
 * The naive schedule is a fixed 1s retry. It is wrong in both directions: too eager
 * while the socket is genuinely down (N clients × one request per second, which is
 * exactly the thundering herd that kept the backend down), and too slow once it is
 * back, because a card the user dragged three seconds ago is still sitting pending.
 *
 * WHY THESE PARTICULAR NUMBERS
 * ----------------------------
 * The intervals are not invented — they are realtime-js's own socket reconnect
 * schedule, copied so that a retrying command and a reconnecting socket move in step
 * instead of fighting each other.
 *
 * From @supabase/realtime-js 2.119.0, `src/RealtimeClient.ts`:
 *
 *   const RECONNECT_INTERVALS = [1000, 2000, 5000, 10000] as const   // line 51
 *   const DEFAULT_RECONNECT_FALLBACK = 10000                         // line 52
 *   ...
 *   return RECONNECT_INTERVALS[tries - 1] || DEFAULT_RECONNECT_FALLBACK  // line 834
 *
 * That alignment is the whole point. `commit` fails because the transport is down;
 * the transport is already counting down to its own rejoin on this schedule. If we
 * retried faster we would spend those attempts hitting a socket we know is not back
 * yet, burn the queue's `MAX_ATTEMPTS` budget on attempts that could not have
 * succeeded, and declare commands terminally rejected while the connection was still
 * mid-recovery. Retrying on the same cadence means roughly one attempt per rejoin
 * opportunity, which is the useful rate.
 *
 * Note the `tries - 1` above: realtime-js's counter starts at 1 for the first retry.
 * Ours is the envelope's `attempts` field, which counts failures so far — so
 * `attempt` 0 is a command that has never been sent, and the two line up exactly.
 *
 * WHY THE JITTER IS INJECTED
 * --------------------------
 * Jitter is what stops a fleet of clients that all dropped at the same instant from
 * retrying at the same instant. But `Math.random()` inside this function would make
 * the retry schedule untestable without fake timers, and would put a non-CSPRNG into
 * the codebase (this repo uses `crypto.getRandomValues` throughout to keep CodeQL's
 * `js/insecure-randomness` rule quiet — see `Workflow Board/src/utils/id.ts`). So the
 * entropy is a parameter, it defaults to a zero source, and production callers pass
 * the crypto-backed source from `src/utils/ids.ts`. `backoffMs(n)` is therefore a
 * pure function of `n`, and the suite needs no timers and no seeding.
 *
 * Jitter only ever adds. A spread of `base ± 20%` would let a later attempt fire
 * sooner than an earlier one, so the delay is `base` plus up to `JITTER_FRACTION`
 * of it — the schedule is a floor that jitter smears upwards, never a midpoint.
 */

/**
 * realtime-js's own reconnect table, verbatim (see the file header for the citation).
 * `attempt` n reads index n-1, so: 1 → 1s, 2 → 2s, 3 → 5s, 4 → 10s.
 */
export const RECONNECT_INTERVALS: readonly number[] = [1000, 2000, 5000, 10000]

/**
 * The documented ceiling: what every attempt at or past the end of the table waits.
 *
 * This is realtime-js's `DEFAULT_RECONNECT_FALLBACK`, and it is deliberately equal to
 * the table's last entry, so the schedule plateaus smoothly rather than stepping when
 * it runs off the end. Growing without bound would be worse than useless here — the
 * queue gives up after `MAX_ATTEMPTS` anyway, so an interval longer than this would
 * only strand a command that the user can still see on screen.
 *
 * `backoff.test.ts` pins this against the table's last element, so the two cannot
 * drift apart if the table is ever updated to track a newer realtime-js.
 */
export const BACKOFF_CEILING_MS = 10_000

/** How much of `base` the jitter source may add, at most. 1000ms → up to 1200ms. */
export const JITTER_FRACTION = 0.2

/**
 * The default entropy source: none.
 *
 * A module-level constant rather than an inline `() => 0` so that the default is one
 * stable reference instead of a fresh closure per call.
 */
const ZERO_JITTER = (): number => 0

/**
 * Pin a jitter sample into 0..1.
 *
 * The source is injected, so its range is a promise made by a caller rather than
 * something this module can verify. Clamping here is what turns the documented bound
 * into an actual guarantee: a source returning 5 cannot stretch a 10s wait into a
 * minute, and one returning -1 cannot pull a delay below its own schedule and break
 * the ordering the rest of the file argues for. NaN maps to 0 so a broken source
 * degrades to "no jitter" rather than poisoning the arithmetic.
 */
function clamp01(sample: number): number {
  if (Number.isNaN(sample)) return 0
  if (sample <= 0) return 0
  if (sample >= 1) return 1
  return sample
}

/**
 * Rounded to whole milliseconds because the result is added to an epoch-ms timestamp
 * (`Envelope.nextAttemptAt`). A fractional millisecond there buys nothing and shows up
 * as noise in persisted queues and in test snapshots.
 */
function withJitter(base: number, jitter: () => number): number {
  return Math.round(base * (1 + JITTER_FRACTION * clamp01(jitter())))
}

/**
 * How long to wait before attempt number `attempt`.
 *
 * `attempt` is the envelope's `attempts` count, so 0 means "never sent yet" and the
 * answer is 0 — the first send is immediate, and the jitter source is not even
 * consulted, because there is no wait to spread out.
 *
 * The result is non-decreasing in `attempt` and saturates at `BACKOFF_CEILING_MS`
 * (before jitter). It is always a finite, non-negative integer, for every input,
 * including the ones a caller should never pass.
 *
 * @param attempt Failures so far. Clamped, never trusted: a negative or non-integer
 *   value is floored into the domain rather than throwing, because a retry schedule
 *   that throws turns a transport blip into a crash.
 * @param jitter Returns 0..1. Defaults to a zero source, which is what keeps this
 *   function pure and the suite deterministic.
 */
export function backoffMs(attempt: number, jitter: () => number = ZERO_JITTER): number {
  // NaN is not an out-of-range attempt, it is a corrupt counter: we no longer know how
  // many times this command has already failed. The safe assumption is "many". Waiting
  // the ceiling is the only answer that cannot turn a bug upstream into a request
  // flood — clamping it to 0 instead would spin the drain loop as fast as it can call.
  if (Number.isNaN(attempt)) return withJitter(BACKOFF_CEILING_MS, jitter)

  // Floor rather than round: 1.7 attempts is not a thing, and flooring keeps the
  // result non-decreasing in `attempt`. Works for ±Infinity too, which then fall out
  // naturally below as "immediate" and "the ceiling".
  const tries = Math.floor(attempt)
  if (tries <= 0) return 0

  // Deliberately the same lookup as realtime-js's: an index past the end of the table
  // falls back to the ceiling, which is what makes the schedule plateau. `??` rather
  // than its `||` because a 0 in the table would be a real value, not a miss.
  const base = RECONNECT_INTERVALS[tries - 1] ?? BACKOFF_CEILING_MS
  return withJitter(base, jitter)
}
