import { describe, expect, it } from 'vitest'
import { BACKOFF_CEILING_MS, JITTER_FRACTION, RECONNECT_INTERVALS, backoffMs } from './backoff'

/** A jitter source stuck at one value — the only kind that keeps the schedule ordered. */
function constantJitter(value: number): () => number {
  return () => value
}

/**
 * A small deterministic PRNG, so a failure in the "arbitrary jitter" sweeps is
 * reproducible. Math.random() would make a red test impossible to re-run.
 */
function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const LAST_INTERVAL = RECONNECT_INTERVALS[RECONNECT_INTERVALS.length - 1]!

describe('the schedule is realtime-js’s, not one we invented', () => {
  it('is @supabase/realtime-js 2.119.0’s RECONNECT_INTERVALS verbatim', () => {
    // src/RealtimeClient.ts line 51. Copied so a retrying command and a reconnecting
    // socket move in step; if this ever has to change, the file header explains what
    // the alignment buys and what breaks without it.
    expect(RECONNECT_INTERVALS).toEqual([1000, 2000, 5000, 10000])
  })

  it('climbs strictly, so each attempt really does wait longer than the last', () => {
    for (let i = 1; i < RECONNECT_INTERVALS.length; i++) {
      expect(RECONNECT_INTERVALS[i]!).toBeGreaterThan(RECONNECT_INTERVALS[i - 1]!)
    }
  })

  it('plateaus with no step: the ceiling equals the table’s last entry', () => {
    // realtime-js's DEFAULT_RECONNECT_FALLBACK is 10000, the same as its last
    // interval. Pinned as a relationship rather than two copies of a literal, so the
    // two cannot drift if the table is updated to track a newer realtime-js.
    expect(BACKOFF_CEILING_MS).toBe(LAST_INTERVAL)
  })
})

describe('backoffMs — the schedule itself', () => {
  it('returns 0 for attempt 0, so the first send is immediate', () => {
    expect(backoffMs(0)).toBe(0)
  })

  it('returns the table verbatim for attempts 1..4 under the default zero jitter', () => {
    expect(backoffMs(1)).toBe(1000)
    expect(backoffMs(2)).toBe(2000)
    expect(backoffMs(3)).toBe(5000)
    expect(backoffMs(4)).toBe(10000)
  })

  it('maps attempt n to index n-1, matching realtime-js’s 1-based tries counter', () => {
    RECONNECT_INTERVALS.forEach((interval, index) => {
      expect(backoffMs(index + 1)).toBe(interval)
    })
  })

  it('caps at the ceiling for attempt 9 rather than growing', () => {
    expect(backoffMs(9)).toBe(BACKOFF_CEILING_MS)
  })

  it('returns exactly the ceiling for every attempt at or past the end of the table', () => {
    for (let attempt = RECONNECT_INTERVALS.length; attempt < 200; attempt++) {
      expect(backoffMs(attempt), `attempt ${attempt}`).toBe(BACKOFF_CEILING_MS)
    }
  })

  it('never exceeds the ceiling, however many attempts are claimed', () => {
    // The queue gives up after MAX_ATTEMPTS, so an unbounded schedule could only
    // strand a command the user can still see on screen.
    for (const attempt of [5, 50, 5_000, Number.MAX_SAFE_INTEGER]) {
      expect(backoffMs(attempt), `attempt ${attempt}`).toBeLessThanOrEqual(BACKOFF_CEILING_MS)
    }
  })
})

describe('backoffMs — monotonicity', () => {
  it('is non-decreasing in attempt number under the default zero jitter', () => {
    for (let attempt = 1; attempt <= 20; attempt++) {
      expect(backoffMs(attempt), `attempt ${attempt}`).toBeGreaterThanOrEqual(backoffMs(attempt - 1))
    }
  })

  it('stays non-decreasing for any constant jitter, since the multiplier is shared', () => {
    for (const sample of [0, 0.25, 0.5, 0.99, 1]) {
      const jitter = constantJitter(sample)
      for (let attempt = 1; attempt <= 20; attempt++) {
        expect(
          backoffMs(attempt, jitter),
          `sample ${sample}, attempt ${attempt}`,
        ).toBeGreaterThanOrEqual(backoffMs(attempt - 1, jitter))
      }
    }
  })

  it('keeps the jittered bands from overlapping while the table is still climbing', () => {
    // JITTER_FRACTION is small relative to the gaps in the table (1200 < 2000,
    // 2400 < 5000, 6000 < 10000), so even a wildly varying source cannot make attempt
    // n fire after attempt n+1. Only on the plateau, where base is constant, can two
    // adjacent delays swap — which is precisely what jitter is for.
    for (let i = 1; i < RECONNECT_INTERVALS.length; i++) {
      const highestForEarlier = backoffMs(i, constantJitter(1))
      const lowestForLater = backoffMs(i + 1, constantJitter(0))
      expect(highestForEarlier, `attempt ${i} vs ${i + 1}`).toBeLessThanOrEqual(lowestForLater)
    }
  })
})

describe('backoffMs — injected jitter', () => {
  it('adds exactly JITTER_FRACTION of the base when the source returns 1', () => {
    expect(backoffMs(1, constantJitter(1))).toBe(1000 * (1 + JITTER_FRACTION))
    expect(backoffMs(2, constantJitter(1))).toBe(2000 * (1 + JITTER_FRACTION))
    expect(backoffMs(3, constantJitter(1))).toBe(5000 * (1 + JITTER_FRACTION))
    expect(backoffMs(4, constantJitter(1))).toBe(10000 * (1 + JITTER_FRACTION))
    expect(backoffMs(99, constantJitter(1))).toBe(BACKOFF_CEILING_MS * (1 + JITTER_FRACTION))
  })

  it('matches the default zero source when the injected source returns 0', () => {
    for (let attempt = 0; attempt <= 6; attempt++) {
      expect(backoffMs(attempt, constantJitter(0)), `attempt ${attempt}`).toBe(backoffMs(attempt))
    }
  })

  it('adds upwards only, so jitter is a smear above the schedule and never below it', () => {
    const rand = mulberry32(12345)
    for (let i = 0; i < 500; i++) {
      const attempt = 1 + (i % 8)
      // Read straight off the table, not from backoffMs itself, so the bound is
      // checked against the published schedule rather than against the code under test.
      const base =
        attempt <= RECONNECT_INTERVALS.length
          ? RECONNECT_INTERVALS[attempt - 1]!
          : BACKOFF_CEILING_MS
      const delay = backoffMs(attempt, rand)
      expect(delay, `attempt ${attempt}`).toBeGreaterThanOrEqual(base)
      expect(delay, `attempt ${attempt}`).toBeLessThanOrEqual(base * (1 + JITTER_FRACTION))
    }
  })

  it('stays inside the documented bound for arbitrary samples across the whole schedule', () => {
    for (const seed of [1, 7, 99, 20_260]) {
      const rand = mulberry32(seed)
      for (let attempt = 0; attempt <= 30; attempt++) {
        const delay = backoffMs(attempt, rand)
        expect(delay, `seed ${seed}, attempt ${attempt}`).toBeGreaterThanOrEqual(backoffMs(attempt))
        expect(delay, `seed ${seed}, attempt ${attempt}`).toBeLessThanOrEqual(
          BACKOFF_CEILING_MS * (1 + JITTER_FRACTION),
        )
      }
    }
  })

  it('clamps an out-of-range sample, so the bound holds even for a broken source', () => {
    // The source is injected, so its range is a caller's promise. Clamping is what
    // makes the documented bound a guarantee rather than a hope.
    expect(backoffMs(1, constantJitter(5))).toBe(1000 * (1 + JITTER_FRACTION))
    expect(backoffMs(1, constantJitter(Number.POSITIVE_INFINITY))).toBe(1000 * (1 + JITTER_FRACTION))
    expect(backoffMs(1, constantJitter(-1))).toBe(1000)
    expect(backoffMs(1, constantJitter(Number.NEGATIVE_INFINITY))).toBe(1000)
    expect(backoffMs(1, constantJitter(Number.NaN))).toBe(1000)
  })

  it('does not consult the jitter source for attempt 0, which has nothing to spread', () => {
    let calls = 0
    const counted = (): number => {
      calls++
      return 1
    }
    expect(backoffMs(0, counted)).toBe(0)
    expect(calls).toBe(0)
  })

  it('samples the source at most once per call, so a CSPRNG draw is never wasted', () => {
    for (const attempt of [1, 4, 99, Number.NaN]) {
      let calls = 0
      backoffMs(attempt, () => {
        calls++
        return 0.5
      })
      expect(calls, `attempt ${attempt}`).toBe(1)
    }
  })
})

describe('backoffMs — hostile attempt numbers never produce NaN or undefined', () => {
  it('clamps a negative attempt to immediate rather than returning NaN', () => {
    expect(backoffMs(-1)).toBe(0)
    expect(backoffMs(-500)).toBe(0)
    expect(backoffMs(Number.NEGATIVE_INFINITY)).toBe(0)
  })

  it('floors a non-integer attempt into the schedule', () => {
    // 1.7 attempts is not a thing. Flooring (rather than rounding) is what keeps the
    // result non-decreasing in `attempt`.
    expect(backoffMs(1.7)).toBe(1000)
    expect(backoffMs(2.999)).toBe(2000)
    expect(backoffMs(0.9)).toBe(0)
    expect(backoffMs(-0.5)).toBe(0)
  })

  it('treats a NaN attempt as a corrupt counter and waits the ceiling, not 0', () => {
    // Returning 0 here would spin the drain loop as fast as it can call. A corrupt
    // counter means we do not know how many failures there have been, so "many" is the
    // only assumption that cannot turn a bug upstream into a request flood.
    expect(backoffMs(Number.NaN)).toBe(BACKOFF_CEILING_MS)
    expect(backoffMs(Number.NaN, constantJitter(1))).toBe(BACKOFF_CEILING_MS * (1 + JITTER_FRACTION))
  })

  it('treats an infinite attempt as past the end of the table', () => {
    expect(backoffMs(Number.POSITIVE_INFINITY)).toBe(BACKOFF_CEILING_MS)
  })

  it('always returns a finite, non-negative integer, for every input in the sweep', () => {
    // The result is added to an epoch-ms timestamp (Envelope.nextAttemptAt), so a
    // fractional or non-finite millisecond would corrupt the queue's own bookkeeping.
    const rand = mulberry32(2)
    const attempts = [
      Number.NaN,
      Number.NEGATIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      -1e9,
      -1.5,
      -1,
      -0,
      0,
      0.5,
      1,
      1.5,
      2,
      3,
      4,
      5,
      17,
      1e6,
      Number.MAX_SAFE_INTEGER,
    ]
    for (const attempt of attempts) {
      for (const jitter of [undefined, constantJitter(0), constantJitter(1), constantJitter(0.37), rand]) {
        const delay = jitter === undefined ? backoffMs(attempt) : backoffMs(attempt, jitter)
        expect(Number.isInteger(delay), `attempt ${attempt} -> ${delay}`).toBe(true)
        expect(delay, `attempt ${attempt}`).toBeGreaterThanOrEqual(0)
        expect(delay, `attempt ${attempt}`).toBeLessThanOrEqual(
          BACKOFF_CEILING_MS * (1 + JITTER_FRACTION),
        )
      }
    }
  })
})

describe('backoffMs — purity', () => {
  it('returns the identical value on repeated calls with no jitter argument', () => {
    // The default zero source is what makes this module deterministic, and therefore
    // what lets the queue's suite assert on nextAttemptAt without fake timers.
    for (let attempt = 0; attempt <= 12; attempt++) {
      expect(backoffMs(attempt), `attempt ${attempt}`).toBe(backoffMs(attempt))
    }
    expect(backoffMs(3)).toBe(5000)
    expect(backoffMs(3)).toBe(5000)
  })

  it('reaches no ambient entropy or clock, which is the constraint the default rests on', () => {
    // Pinned by replacing both with throwing stubs: the purity claim in the file header
    // is load-bearing (the whole retry path is tested without timers), so it is checked
    // rather than asserted in a comment.
    const realRandom = Math.random
    const realNow = Date.now
    Math.random = () => {
      throw new Error('backoff must not reach Math.random — jitter is injected')
    }
    Date.now = () => {
      throw new Error('backoff must not read the clock — time is passed in')
    }
    try {
      for (const attempt of [0, 1, 4, 99, -1, 1.5, Number.NaN]) {
        expect(() => backoffMs(attempt)).not.toThrow()
        expect(() => backoffMs(attempt, constantJitter(1))).not.toThrow()
      }
    } finally {
      Math.random = realRandom
      Date.now = realNow
    }
  })
})
