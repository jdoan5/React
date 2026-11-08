import { describe, expect, it } from 'vitest'
import { compareOrder, indexOf, planInsert, planMove, sortByOrder, type Ordered } from './ordering'

const card = (id: string, orderKey: string): Ordered => ({ id, orderKey })

/** A column of n cards with the short, evenly spaced keys a fresh board would have. */
function column(n: number): Ordered[] {
  return Array.from({ length: n }, (_, i) => card(`c${i}`, `a${i}`))
}

describe('compareOrder', () => {
  it('orders by order key', () => {
    expect(compareOrder(card('x', 'a0'), card('y', 'a1'))).toBeLessThan(0)
    expect(compareOrder(card('x', 'a1'), card('y', 'a0'))).toBeGreaterThan(0)
  })

  it('breaks ties on id when two clients mint the same key', () => {
    expect(compareOrder(card('alice', 'a0V'), card('bob', 'a0V'))).toBeLessThan(0)
    expect(compareOrder(card('bob', 'a0V'), card('alice', 'a0V'))).toBeGreaterThan(0)
  })

  it('is 0 only for the same row', () => {
    expect(compareOrder(card('x', 'a0'), card('x', 'a0'))).toBe(0)
  })

  it('is a consistent total order — antisymmetric and transitive', () => {
    const rows = [card('b', 'a1'), card('a', 'a1'), card('c', 'a0'), card('a', 'a2')]
    for (const x of rows) {
      for (const y of rows) {
        // `|| 0` normalises -0, which Object.is distinguishes from 0.
        expect(Math.sign(compareOrder(x, y))).toBe(-Math.sign(compareOrder(y, x)) || 0)
      }
    }
    const sorted = sortByOrder(rows)
    for (let i = 1; i < sorted.length; i++) {
      expect(compareOrder(sorted[i - 1]!, sorted[i]!)).toBeLessThanOrEqual(0)
    }
  })
})

describe('sortByOrder', () => {
  it('does not mutate its input', () => {
    const rows = [card('b', 'a1'), card('a', 'a0')]
    const copy = [...rows]
    sortByOrder(rows)
    expect(rows).toEqual(copy)
  })

  it('is insertion-order independent — the convergence property', () => {
    // The same rows delivered in different orders, as two clients would receive
    // them over a realtime stream, must produce byte-identical lists.
    const rows = [card('c', 'a2'), card('a', 'a0'), card('d', 'a0V'), card('b', 'a0V')]
    const shuffles = [
      [rows[0]!, rows[1]!, rows[2]!, rows[3]!],
      [rows[3]!, rows[2]!, rows[1]!, rows[0]!],
      [rows[2]!, rows[0]!, rows[3]!, rows[1]!],
    ]
    const results = shuffles.map((s) => sortByOrder(s).map((r) => r.id))
    expect(results[0]).toEqual(['a', 'b', 'd', 'c'])
    expect(results[1]).toEqual(results[0])
    expect(results[2]).toEqual(results[0])
  })
})

describe('planMove', () => {
  it('returns null for a drop that changes nothing, so no revision is burned', () => {
    const items = column(4)
    expect(planMove(items, 'c2', 2)).toBeNull()
    expect(planMove(items, 'c0', 0)).toBeNull()
  })

  it('moves a card to the front', () => {
    const items = column(4)
    const key = planMove(items, 'c3', 0)!
    expect(key).not.toBeNull()
    expect(key < 'a0').toBe(true)
  })

  it('moves a card to the back', () => {
    const items = column(4)
    const key = planMove(items, 'c0', 3)!
    expect('a3' < key).toBe(true)
  })

  it('moves a card into the middle, between its new neighbours', () => {
    const items = column(5)
    // c0 to index 2: the list without c0 is a1,a2,a3,a4 — so it lands between a2 and a3.
    const key = planMove(items, 'c0', 2)!
    expect('a2' < key && key < 'a3').toBe(true)
  })

  it('lands the card at exactly the requested index', () => {
    for (const to of [0, 1, 2, 3, 4]) {
      const items = column(5)
      const key = planMove(items, 'c0', to)
      const moved = key === null ? items : [
        ...items.filter((i) => i.id !== 'c0'),
        card('c0', key),
      ]
      expect(indexOf(moved, 'c0'), `to=${to}`).toBe(to)
    }
  })

  it('removes the moving card before measuring, so indices never need adjusting', () => {
    // Dragging downward is where an unadjusted index is off by one. c0 -> index 3
    // of a 5-card column must end up third, not fourth.
    const items = column(5)
    const key = planMove(items, 'c0', 3)!
    const moved = [...items.filter((i) => i.id !== 'c0'), card('c0', key)]
    expect(sortByOrder(moved).map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c0', 'c4'])
  })

  it('clamps an out-of-range index instead of throwing', () => {
    const items = column(3)
    expect(planMove(items, 'c1', -10)).not.toBeNull()
    expect(planMove(items, 'c1', 99)).not.toBeNull()
  })

  it('handles a single-card column', () => {
    expect(planMove([card('only', 'a0')], 'only', 0)).toBeNull()
  })

  it('treats an unknown id as an insert rather than throwing', () => {
    const items = column(3)
    const key = planMove(items, 'nope', 1)!
    expect('a0' < key && key < 'a1').toBe(true)
  })

  it('works on an unsorted input — it sorts first', () => {
    const scrambled = [card('c2', 'a2'), card('c0', 'a0'), card('c1', 'a1')]
    const key = planMove(scrambled, 'c2', 0)!
    expect(key < 'a0').toBe(true)
  })
})

describe('planInsert', () => {
  it('appends to an empty column', () => {
    expect(planInsert([], 0)).toBe('a0')
  })

  it('inserts between neighbours in another column', () => {
    const key = planInsert(column(3), 1)
    expect('a0' < key && key < 'a1').toBe(true)
  })

  it('does not remove anything, because a cross-column drop is not in the list', () => {
    const target = column(3)
    const key = planInsert(target, 3)
    expect('a2' < key).toBe(true)
  })
})

describe('concurrent drops — what actually happens on two clients', () => {
  it('two different cards into the same gap: both survive, order agreed', () => {
    const shared = column(2) // a0, a1

    // Neither client has seen the other's write yet, so both plan against the
    // same list and both legitimately mint the same key.
    const aliceKey = planInsert(shared, 1)
    const bobKey = planInsert(shared, 1)
    expect(aliceKey).toBe(bobKey)

    // Both rows land. Nothing was renumbered and nothing was lost.
    const merged = [...shared, card('alice', aliceKey), card('bob', bobKey)]

    // And crucially, both clients compute the same list — the id tiebreak is
    // what makes that true.
    const fromAlice = sortByOrder(merged).map((c) => c.id)
    const fromBob = sortByOrder([...merged].reverse()).map((c) => c.id)
    expect(fromAlice).toEqual(['c0', 'alice', 'bob', 'c1'])
    expect(fromBob).toEqual(fromAlice)
  })

  it('the same card moved by two clients: one row, last write wins, no corruption', () => {
    const items = column(4)
    const aliceKey = planMove(items, 'c3', 0)!
    const bobKey = planMove(items, 'c3', 2)!

    // Both wrote order_key on the SAME row, so the row simply holds whichever
    // landed second. There is no partial state and no duplicate.
    const afterAlice = [...items.filter((i) => i.id !== 'c3'), card('c3', aliceKey)]
    const afterBob = [...items.filter((i) => i.id !== 'c3'), card('c3', bobKey)]
    expect(afterAlice).toHaveLength(4)
    expect(afterBob).toHaveLength(4)
    expect(sortByOrder(afterBob).map((c) => c.id)).toEqual(['c0', 'c1', 'c3', 'c2'])
  })

  it('moves of different cards never interact', () => {
    const items = column(5)
    const aliceKey = planMove(items, 'c0', 4)!
    const bobKey = planMove(items, 'c4', 0)!

    // Apply both, in either order — one row each, no overlap.
    const merged = [
      ...items.filter((i) => i.id !== 'c0' && i.id !== 'c4'),
      card('c0', aliceKey),
      card('c4', bobKey),
    ]
    const ids = sortByOrder(merged).map((c) => c.id)
    expect(ids).toHaveLength(5)
    expect(new Set(ids).size).toBe(5)
    expect(ids[0]).toBe('c4')
    expect(ids[4]).toBe('c0')
  })
})

describe('indexOf', () => {
  it('finds a card by canonical position, not array position', () => {
    const scrambled = [card('c2', 'a2'), card('c0', 'a0'), card('c1', 'a1')]
    expect(indexOf(scrambled, 'c0')).toBe(0)
    expect(indexOf(scrambled, 'c2')).toBe(2)
  })

  it('returns -1 for an unknown id', () => {
    expect(indexOf(column(3), 'nope')).toBe(-1)
  })
})
