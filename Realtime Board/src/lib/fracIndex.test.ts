import { describe, expect, it } from 'vitest'
import {
  BASE62,
  FIRST_KEY,
  OrderKeyError,
  isValidKey,
  keyBetween,
  keyForIndex,
  keysBetween,
  maxKeyLength,
  rebalance,
  validateKey,
} from './fracIndex'

/** Strictly ascending in plain lexicographic order — the property everything rests on. */
function isAscending(keys: readonly string[]): boolean {
  return keys.every((key, i) => i === 0 || keys[i - 1]! < key)
}

/**
 * Vectors produced by running the reference implementation (fractional-indexing@3.2.0,
 * MIT) and recorded here. This module is an independent implementation of the same
 * published algorithm, so matching these proves interoperability: keys written by one
 * can be read and extended by the other.
 */
describe('golden vectors — agreement with the reference implementation', () => {
  it.each([
    [null, null, 'a0'],
    ['a0', null, 'a1'],
    ['a1', null, 'a2'],
    [null, 'a0', 'Zz'],
    [null, 'Zz', 'Zy'],
    ['a0', 'a1', 'a0V'],
    ['a1', 'a2', 'a1V'],
  ] as Array<[string | null, string | null, string]>)('keyBetween(%s, %s) === %s', (a, b, want) => {
    expect(keyBetween(a, b)).toBe(want)
  })

  it.each([
    [null, null, 5, ['a0', 'a1', 'a2', 'a3', 'a4']],
    ['a1', 'a2', 4, ['a18', 'a1G', 'a1V', 'a1l']],
    ['a0', null, 3, ['a1', 'a2', 'a3']],
    [null, 'a0', 3, ['Zx', 'Zy', 'Zz']],
    [null, null, 0, []],
  ] as Array<[string | null, string | null, number, string[]]>)(
    'keysBetween(%s, %s, %i)',
    (a, b, n, want) => {
      expect(keysBetween(a, b, n)).toEqual(want)
    },
  )

  it('crosses "az" -> "b00" on append at exactly the reference position', () => {
    let cursor: string | null = null
    const keys: string[] = []
    for (let i = 0; i < 66; i++) {
      cursor = keyBetween(cursor, null)
      keys.push(cursor)
    }
    expect(keys.slice(59, 65)).toEqual(['ax', 'ay', 'az', 'b00', 'b01', 'b02'])
  })

  it('crosses "Z0" -> "Yzz" on prepend at exactly the reference position', () => {
    let cursor: string | null = null
    const keys: string[] = []
    for (let i = 0; i < 66; i++) {
      cursor = keyBetween(null, cursor)
      keys.push(cursor)
    }
    expect(keys.slice(61, 65)).toEqual(['Z1', 'Z0', 'Yzz', 'Yzy'])
  })

  it('reproduces the reference’s emit/accept asymmetry at the minimum key', () => {
    // Documented quirk, shared with the reference: this key can be produced but is
    // then rejected as input. Reaching it needs ~62^26 prepends, so it is a curiosity
    // rather than a risk — pinned so a future reader does not assume the two are
    // inverses and "fix" the validator.
    const smallest = keyBetween(null, 'A' + '0'.repeat(25) + '1')
    expect(smallest).toBe('A00000000000000000000000000')
    expect(() => keyBetween(smallest, null)).toThrow(OrderKeyError)
  })
})

describe('keyBetween — the four boundary cases', () => {
  it('gives a mid-range key for an empty list, leaving room on both sides', () => {
    expect(keyBetween(null, null)).toBe(FIRST_KEY)
    expect(keyBetween(null, null)).toBe('a0')
  })

  it('appends by stepping the integer part up', () => {
    expect(keyBetween('a0', null)).toBe('a1')
    expect(keyBetween('a1', null)).toBe('a2')
  })

  it('prepends by stepping the integer part down into the negative range', () => {
    expect(keyBetween(null, 'a0')).toBe('Zz')
    expect(keyBetween(null, 'Zz')).toBe('Zy')
  })

  it('inserts between two adjacent keys by growing a fractional part', () => {
    expect(keyBetween('a0', 'a1')).toBe('a0V')
    expect(keyBetween('a0', 'a0V')).toBe('a0G')
  })
})

describe('keyBetween — ordering guarantees', () => {
  it('always returns a key strictly between its arguments', () => {
    const pairs: Array<[string, string]> = [
      ['a0', 'a1'],
      ['a0', 'a0V'],
      ['Zz', 'a0'],
      ['a0V', 'a1'],
      ['azz', 'b00'],
    ]
    for (const [lo, hi] of pairs) {
      const mid = keyBetween(lo, hi)
      expect(lo < mid, `${lo} < ${mid}`).toBe(true)
      expect(mid < hi, `${mid} < ${hi}`).toBe(true)
    }
  })

  it('rejects arguments that are out of order', () => {
    expect(() => keyBetween('a1', 'a0')).toThrow(OrderKeyError)
    expect(() => keyBetween('a1', 'a1')).toThrow(/out of order/)
  })

  it('rejects malformed keys rather than producing a bad ordering', () => {
    expect(() => keyBetween('', null)).toThrow(OrderKeyError)
    expect(() => keyBetween('!', null)).toThrow(OrderKeyError)
    // 'a' claims a two-character integer part but supplies one character.
    expect(() => keyBetween('a', null)).toThrow(OrderKeyError)
    // A trailing zero is a second spelling of the same position.
    expect(() => keyBetween('a00', null)).toThrow(/trailing zero/)
  })
})

describe('keyBetween — the integer part rolls over cleanly', () => {
  it('widens from "az" to "b00" instead of overflowing', () => {
    const keys: string[] = []
    let cursor = FIRST_KEY
    for (let i = 0; i < 70; i++) {
      cursor = keyBetween(cursor, null)
      keys.push(cursor)
    }
    expect(keys.slice(59, 63)).toEqual(['ay', 'az', 'b00', 'b01'])
    expect(isAscending(keys)).toBe(true)
  })

  it('stays ascending across 500 appends and 500 prepends', () => {
    const appended: string[] = []
    let cursor: string | null = null
    for (let i = 0; i < 500; i++) {
      cursor = keyBetween(cursor, null)
      appended.push(cursor)
    }
    expect(isAscending(appended)).toBe(true)

    const prepended: string[] = []
    cursor = null
    for (let i = 0; i < 500; i++) {
      cursor = keyBetween(null, cursor)
      prepended.push(cursor)
    }
    expect(isAscending([...prepended].reverse())).toBe(true)
  })
})

describe('keyBetween — repeated inserts into the same gap', () => {
  it('never runs out of room, which is the whole reason keys are strings', () => {
    let lo = 'a0'
    const hi = 'a1'
    const produced: string[] = []
    for (let i = 0; i < 2000; i++) {
      const mid = keyBetween(lo, hi)
      expect(lo < mid && mid < hi).toBe(true)
      produced.push(mid)
      lo = mid
    }
    expect(isAscending(produced)).toBe(true)
  })

  it('grows keys slowly — about one character per five inserts, not one per insert', () => {
    let lo = 'a0'
    let hi = 'a1'
    for (let i = 0; i < 10; i++) {
      hi = keyBetween(lo, hi)
    }
    // A float midpoint would have exhausted precision long before this; a naive
    // "append a digit" scheme would be 10 characters longer.
    expect(hi.length).toBeLessThanOrEqual(6)
    expect(lo < hi).toBe(true)
  })
})

describe('keyBetween — concurrent inserts into the same gap', () => {
  it('produces two surviving keys rather than one clobbering the other', () => {
    // Two clients both decide to insert between a0 and a1 without seeing each other.
    const fromAlice = keyBetween('a0', 'a1')
    const fromBob = keyBetween('a0', 'a1')

    // They generate the same key — the honest limitation of fractional indexing.
    // Neither row is lost: both are valid, and the tie is broken by a stable
    // secondary sort on id, which is what the board does.
    expect(fromAlice).toBe(fromBob)

    const rows = [
      { id: 'bob', key: fromBob },
      { id: 'alice', key: fromAlice },
    ]
    const sorted = [...rows].sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : x.id < y.id ? -1 : 1))
    expect(sorted.map((r) => r.id)).toEqual(['alice', 'bob'])
  })

  it('keeps both cards when the two clients see each other and re-insert', () => {
    const first = keyBetween('a0', 'a1')
    const second = keyBetween('a0', first)
    expect(second < first).toBe(true)
    expect(isAscending(['a0', second, first, 'a1'])).toBe(true)
  })
})

describe('keysBetween', () => {
  it('returns nothing for a non-positive count', () => {
    expect(keysBetween(null, null, 0)).toEqual([])
    expect(keysBetween(null, null, -3)).toEqual([])
  })

  it('returns exactly count keys, ascending, inside the bounds', () => {
    for (const count of [1, 2, 3, 5, 17]) {
      for (const [lo, hi] of [
        [null, null],
        ['a0', null],
        [null, 'a0'],
        ['a0', 'a1'],
      ] as Array<[string | null, string | null]>) {
        const keys = keysBetween(lo, hi, count)
        expect(keys, `count=${count} lo=${lo} hi=${hi}`).toHaveLength(count)
        expect(isAscending(keys)).toBe(true)
        if (lo !== null) expect(lo < keys[0]!).toBe(true)
        if (hi !== null) expect(keys[keys.length - 1]! < hi).toBe(true)
      }
    }
  })

  it('seeds an empty list with short, evenly spaced keys', () => {
    expect(keysBetween(null, null, 5)).toEqual(['a0', 'a1', 'a2', 'a3', 'a4'])
  })

  it('splits the range rather than piling every key against one end', () => {
    const keys = keysBetween('a0', 'a1', 4)
    expect(keys).toEqual(['a08', 'a0G', 'a0V', 'a0l'])
    expect(maxKeyLength(keys)).toBe(3)
  })
})

describe('keyForIndex', () => {
  const keys = ['a0', 'a1', 'a2']

  it('prepends at index 0', () => {
    const key = keyForIndex(keys, 0)
    expect(key < 'a0').toBe(true)
  })

  it('inserts between neighbours in the middle', () => {
    const key = keyForIndex(keys, 1)
    expect('a0' < key && key < 'a1').toBe(true)
  })

  it('appends at the end', () => {
    const key = keyForIndex(keys, keys.length)
    expect('a2' < key).toBe(true)
  })

  it('handles an empty list', () => {
    expect(keyForIndex([], 0)).toBe(FIRST_KEY)
  })

  it('clamps an out-of-range index instead of throwing', () => {
    expect(keyForIndex(keys, -5) < 'a0').toBe(true)
    expect('a2' < keyForIndex(keys, 99)).toBe(true)
  })

  it('round-trips a drag: removing then reinserting lands the card at the target slot', () => {
    // Move the card at index 0 to index 2 of a four-card column.
    const column = ['a0', 'a1', 'a2', 'a3']
    const moved = column[0]!
    const without = column.filter((k) => k !== moved)
    const newKey = keyForIndex(without, 2)
    const after = [...without, newKey].sort()
    expect(after.indexOf(newKey)).toBe(2)
    expect(isAscending(after)).toBe(true)
  })
})

describe('validateKey', () => {
  it.each([
    ['a0', true],
    ['a1', true],
    ['Zz', true],
    ['a0V', true],
    // 'b' declares a three-character integer part, so these zeros are integer
    // digits, not a fractional trailing zero. The append path really does emit it.
    ['b00', true],
    // 'a' declares two characters, so the third is a fractional trailing zero —
    // a second spelling of 'a0', which would break the key/position bijection.
    ['a00', false],
    ['', false],
    ['a', false], // integer part shorter than its header claims
    ['!0', false], // invalid header
    ['a0!', false], // invalid fractional digit
  ])('%s -> %s', (key, valid) => {
    expect(isValidKey(key)).toBe(valid)
  })

  it('throws OrderKeyError with a useful message', () => {
    expect(() => validateKey('')).toThrow(/empty/)
    expect(() => validateKey('a0!')).toThrow(/invalid digit/)
  })
})

describe('rebalance', () => {
  it('assigns short, evenly spaced keys to a whole column', () => {
    const keys = rebalance(50)
    expect(keys).toHaveLength(50)
    expect(isAscending(keys)).toBe(true)
    expect(maxKeyLength(keys)).toBeLessThanOrEqual(2)
  })

  it('is what a column needs after keys have grown long', () => {
    let lo = 'a0'
    const hi = 'a1'
    const grown: string[] = []
    for (let i = 0; i < 40; i++) {
      lo = keyBetween(lo, hi)
      grown.push(lo)
    }
    expect(maxKeyLength(grown)).toBeGreaterThan(5)
    expect(maxKeyLength(rebalance(grown.length))).toBeLessThanOrEqual(2)
  })
})

describe('property: a random sequence of inserts always stays ordered', () => {
  // A small deterministic PRNG, so a failure is reproducible. Math.random() would
  // make a red test impossible to re-run.
  function mulberry32(seed: number): () => number {
    let a = seed
    return () => {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  it.each([1, 2, 3, 12345])('seed %i: 400 inserts at random positions', (seed) => {
    const rand = mulberry32(seed)
    const column: string[] = []
    for (let i = 0; i < 400; i++) {
      const at = Math.floor(rand() * (column.length + 1))
      const key = keyForIndex(column, at)
      column.splice(at, 0, key)
      expect(isAscending(column), `broke at insert ${i}`).toBe(true)
    }
    expect(column).toHaveLength(400)
    expect(new Set(column).size, 'all keys distinct').toBe(400)
    expect([...column].sort()).toEqual(column)
  })

  it.each([7, 99])('seed %i: 300 random moves of existing cards', (seed) => {
    const rand = mulberry32(seed)
    const column = rebalance(25)
    for (let i = 0; i < 300; i++) {
      const from = Math.floor(rand() * column.length)
      const [moved] = column.splice(from, 1)
      expect(moved).toBeDefined()
      const to = Math.floor(rand() * (column.length + 1))
      column.splice(to, 0, keyForIndex(column, to))
      expect(isAscending(column), `broke at move ${i}`).toBe(true)
    }
    expect(column).toHaveLength(25)
  })
})

describe('custom digit sets', () => {
  it('works with a smaller alphabet, which makes key growth easy to observe', () => {
    const digits = '0123456789'
    const a = keyBetween(null, null, digits)
    const b = keyBetween(a, null, digits)
    expect(a < b).toBe(true)
    const mid = keyBetween(a, b, digits)
    expect(a < mid && mid < b).toBe(true)
  })

  it('BASE62 is in ascii order, so digit order matches string comparison', () => {
    const chars = [...BASE62]
    const sorted = [...chars].sort()
    expect(chars).toEqual(sorted)
    expect(BASE62).toHaveLength(62)
  })
})
