import { describe, expect, it } from 'vitest'
import { collapsePresence, partitionSelf, presencePayload, type PresenceEntry } from './presence'
import type { Collaborator } from '../types'

const ME = 'u-me'

/**
 * One connection as Realtime hands it back: the payload its client sent, plus the
 * `presence_ref` Realtime minted for that socket. The ref is explicit in every
 * call because it is what distinguishes "two tabs" from "one tab listed twice".
 */
function conn(userId: string, ref: string, over: Partial<PresenceEntry> = {}): PresenceEntry {
  return { presence_ref: ref, userId, name: userId.toUpperCase(), color: '#2563eb', at: 1_000, ...over }
}

/** The map shape `presenceState()` returns: one key per connection, an array per key. */
function state(...entries: readonly PresenceEntry[]): Readonly<Record<string, readonly unknown[]>> {
  return Object.fromEntries(entries.map((entry, i) => [`key-${i}`, [entry]]))
}

/**
 * The parameter type promises arrays of well-formed entries. The wire promises
 * nothing, and these are the shapes a peer can actually send, so the cast is the
 * subject of the test rather than a convenience.
 */
function untrusted(map: unknown): Readonly<Record<string, readonly unknown[]>> {
  return map as Readonly<Record<string, readonly unknown[]>>
}

describe('collapsePresence — one human is one avatar', () => {
  it('collapses two presence_refs for one userId into one collaborator with tabs: 2', () => {
    const roster = collapsePresence(state(conn('u-ana', 'a'), conn('u-ana', 'b')), ME)
    expect(roster).toHaveLength(1)
    expect(roster[0]).toMatchObject({ userId: 'u-ana', tabs: 2 })
  })

  it('counts tabs for one human across several entries under the SAME key', () => {
    // A key can legitimately hold more than one connection, which is the half of
    // the shape that counting `Object.keys(state).length` misses entirely.
    const roster = collapsePresence({ 'key-0': [conn('u-ana', 'a'), conn('u-ana', 'b')] }, ME)
    expect(roster).toEqual([
      { userId: 'u-ana', name: 'U-ANA', color: '#2563eb', tabs: 2, isSelf: false },
    ])
  })

  it('counts a repeated presence_ref once — one socket listed twice is not two tabs', () => {
    const roster = collapsePresence(state(conn('u-ana', 'a'), conn('u-ana', 'a')), ME)
    expect(roster[0]?.tabs).toBe(1)
  })

  it('counts entries with no presence_ref separately, since each is its own connection', () => {
    const roster = collapsePresence(
      untrusted({
        k1: [{ userId: 'u-ana', name: 'Ana', color: '#111111', at: 1 }],
        k2: [{ userId: 'u-ana', name: 'Ana', color: '#111111', at: 1 }],
      }),
      ME,
    )
    expect(roster[0]?.tabs).toBe(2)
  })

  it('keeps distinct humans separate', () => {
    const roster = collapsePresence(
      state(conn('u-ana', 'a'), conn('u-bo', 'b'), conn('u-ana', 'c')),
      ME,
    )
    expect(roster.map((entry) => [entry.userId, entry.tabs])).toEqual([
      ['u-ana', 2],
      ['u-bo', 1],
    ])
  })

  it('flags the self entry and keeps it, so the UI can render "you"', () => {
    const roster = collapsePresence(
      state(conn('u-ana', 'a', { name: 'Ana' }), conn(ME, 'b', { name: 'Me' })),
      ME,
    )
    expect(roster.map((entry) => [entry.userId, entry.isSelf])).toEqual([
      ['u-ana', false],
      [ME, true],
    ])
  })

  it('flags nobody when my own presence has not come back yet', () => {
    const roster = collapsePresence(state(conn('u-ana', 'a')), ME)
    expect(roster.every((entry) => !entry.isSelf)).toBe(true)
  })
})

describe('collapsePresence — stable order', () => {
  it('orders by name, then userId, so an unrelated join does not reshuffle the row', () => {
    const before = collapsePresence(
      state(conn('u-3', 'c', { name: 'Ana' }), conn('u-1', 'a', { name: 'Zoe' })),
      ME,
    )
    const after = collapsePresence(
      state(
        conn('u-3', 'c', { name: 'Ana' }),
        conn('u-2', 'b', { name: 'Mo' }),
        conn('u-1', 'a', { name: 'Zoe' }),
      ),
      ME,
    )
    expect(before.map((entry) => entry.name)).toEqual(['Ana', 'Zoe'])
    expect(after.map((entry) => entry.name)).toEqual(['Ana', 'Mo', 'Zoe'])
  })

  it('breaks a name tie on userId, so two people called Ana hold their places', () => {
    const roster = collapsePresence(
      state(conn('u-b', 'b', { name: 'Ana' }), conn('u-a', 'a', { name: 'Ana' })),
      ME,
    )
    expect(roster.map((entry) => entry.userId)).toEqual(['u-a', 'u-b'])
  })

  it('does not depend on the map’s key order — two clients compute the same roster', () => {
    // Object key iteration is insertion order, and no two clients receive the same
    // insertion order. Same connections, inserted the other way round.
    const ana = conn('u-ana', 'a')
    const bo = conn('u-bo', 'b')
    expect(collapsePresence({ k1: [ana], k2: [bo] }, ME)).toEqual(
      collapsePresence({ k2: [bo], k1: [ana] }, ME),
    )
  })
})

describe('collapsePresence — which tab supplies the label', () => {
  it('takes the name and colour from the newest entry, so a rename shows up', () => {
    const roster = collapsePresence(
      state(
        conn('u-ana', 'old', { name: 'Ana', color: '#111111', at: 10 }),
        conn('u-ana', 'new', { name: 'Ana Lovelace', color: '#222222', at: 20 }),
      ),
      ME,
    )
    expect(roster[0]).toMatchObject({ name: 'Ana Lovelace', color: '#222222', tabs: 2 })
  })

  it('resolves an `at` tie from the data, not from the map order', () => {
    const first = conn('u-ana', 'a', { name: 'Ana', at: 10 })
    const second = conn('u-ana', 'b', { name: 'Anabel', at: 10 })
    expect(collapsePresence(state(first, second), ME)[0]?.name).toBe('Ana')
    expect(collapsePresence(state(second, first), ME)[0]?.name).toBe('Ana')
  })

  it('keeps an entry whose `at` is unusable, ranking it oldest rather than dropping it', () => {
    // `at` only picks between labels. Dropping a peer over it would be a phantom in
    // the other direction: someone on the board who is missing from the row.
    const roster = collapsePresence(
      untrusted({
        k1: [{ presence_ref: 'a', userId: 'u-ana', name: 'Ana', color: '#111111', at: Number.NaN }],
        k2: [{ presence_ref: 'b', userId: 'u-bo', name: 'Bo', color: '#222222' }],
      }),
      ME,
    )
    expect(roster.map((entry) => [entry.userId, entry.tabs])).toEqual([
      ['u-ana', 1],
      ['u-bo', 1],
    ])
  })

  it('lets a real `at` outrank an unusable one', () => {
    const roster = collapsePresence(
      untrusted({
        k1: [{ presence_ref: 'a', userId: 'u-ana', name: 'Stale', color: '#111111', at: 'soon' }],
        k2: [conn('u-ana', 'b', { name: 'Fresh', at: 1 })],
      }),
      ME,
    )
    expect(roster[0]).toMatchObject({ name: 'Fresh', tabs: 2 })
  })
})

describe('collapsePresence — untrusted input is dropped, never thrown on', () => {
  it('yields an empty roster for an empty map, rather than crashing', () => {
    expect(collapsePresence({}, ME)).toEqual([])
  })

  it('ignores a key mapped to an empty array', () => {
    expect(collapsePresence({ 'key-0': [], 'key-1': [conn('u-ana', 'a')] }, ME)).toHaveLength(1)
  })

  it.each([
    ['missing userId', { name: 'Ana', color: '#111111', at: 1 }],
    ['missing name', { userId: 'u-ana', color: '#111111', at: 1 }],
    ['missing color', { userId: 'u-ana', name: 'Ana', at: 1 }],
    ['an empty userId', { userId: '', name: 'Ana', color: '#111111', at: 1 }],
    ['a blank name', { userId: 'u-ana', name: '   ', color: '#111111', at: 1 }],
    ['a numeric userId', { userId: 7, name: 'Ana', color: '#111111', at: 1 }],
    ['a null name', { userId: 'u-ana', name: null, color: '#111111', at: 1 }],
    ['an object colour', { userId: 'u-ana', name: 'Ana', color: { hex: '#111111' }, at: 1 }],
    ['an array where an entry should be', ['u-ana', 'Ana']],
  ] as ReadonlyArray<readonly [string, unknown]>)('drops an entry with %s', (_label, entry) => {
    expect(collapsePresence(untrusted({ 'key-0': [entry] }), ME)).toEqual([])
  })

  it.each([
    ['a string', 'nope'],
    ['a number', 42],
    ['null', null],
    ['undefined', undefined],
  ] as ReadonlyArray<readonly [string, unknown]>)(
    'drops %s where an entry should be',
    (_label, value) => {
      expect(collapsePresence(untrusted({ 'key-0': [value] }), ME)).toEqual([])
    },
  )

  it.each([
    ['a string', 'nope'],
    ['null', null],
    ['a bare object', { userId: 'u-ana' }],
  ] as ReadonlyArray<readonly [string, unknown]>)(
    'drops a key whose value is %s instead of an array',
    (_label, value) => {
      expect(collapsePresence(untrusted({ 'key-0': value }), ME)).toEqual([])
    },
  )

  it('keeps every good peer when one peer is malformed — a bad entry cannot blank the row', () => {
    // The failure this pins: a throw in here escapes the `sync` handler, so the whole
    // avatar row vanishes because somebody else deployed a bad payload.
    const roster = collapsePresence(
      untrusted({
        k1: [conn('u-ana', 'a', { name: 'Ana' })],
        k2: ['garbage'],
        k3: [{ presence_ref: 'c', userId: 'u-bo', name: 'Bo', color: '#222222', at: 2 }],
        k4: [null],
        k5: 'not-an-array',
      }),
      ME,
    )
    expect(roster.map((entry) => entry.userId)).toEqual(['u-ana', 'u-bo'])
  })

  it('treats a userId of "__proto__" as an ordinary collaborator', () => {
    // Grouping into a plain object would collide with Object.prototype here, and
    // userId is whatever a peer says it is.
    const roster = collapsePresence(state(conn('__proto__', 'a'), conn('__proto__', 'b')), ME)
    expect(roster).toEqual([
      { userId: '__proto__', name: '__PROTO__', color: '#2563eb', tabs: 2, isSelf: false },
    ])
  })

  it('survives a null state, which a transport could hand the sync handler', () => {
    expect(collapsePresence(untrusted(null), ME)).toEqual([])
  })
})

describe('collapsePresence — purity', () => {
  it('gives deep-equal output for the same input twice', () => {
    const map = state(conn('u-ana', 'a'), conn('u-ana', 'b'), conn(ME, 'c'))
    expect(collapsePresence(map, ME)).toEqual(collapsePresence(map, ME))
  })

  it('does not mutate the presence map it was given', () => {
    const map = state(conn('u-ana', 'a'), conn('u-bo', 'b'))
    const copy = structuredClone(map)
    collapsePresence(map, ME)
    expect(map).toEqual(copy)
  })
})

describe('presencePayload', () => {
  const me: Collaborator = { userId: ME, name: 'Me', color: '#2563eb', tabs: 3 }

  it('uses the `now` it was given and never reads a clock', () => {
    expect(presencePayload(me, 1_700_000_000_000).at).toBe(1_700_000_000_000)
    expect(presencePayload(me, 0).at).toBe(0)
  })

  it('publishes identity only — tabs is derived, so sending it would be a second truth', () => {
    expect(presencePayload(me, 5)).toEqual({ userId: ME, name: 'Me', color: '#2563eb', at: 5 })
  })

  it('round-trips through collapsePresence as one collaborator with the tab count', () => {
    // The pair is the contract: what track() sends is what presenceState() returns.
    const sent = presencePayload(me, 5)
    const roster = collapsePresence(
      { k1: [{ ...sent, presence_ref: 'r1' }], k2: [{ ...sent, presence_ref: 'r2' }] },
      ME,
    )
    expect(roster).toEqual([{ userId: ME, name: 'Me', color: '#2563eb', tabs: 2, isSelf: true }])
  })
})

describe('partitionSelf', () => {
  it('splits me out of the roster while leaving the others in order', () => {
    const roster = collapsePresence(
      state(
        conn('u-ana', 'a', { name: 'Ana' }),
        conn(ME, 'b', { name: 'Me' }),
        conn('u-bo', 'c', { name: 'Bo' }),
      ),
      ME,
    )
    const { me, others } = partitionSelf(roster)
    expect(me?.userId).toBe(ME)
    expect(others.map((entry) => entry.name)).toEqual(['Ana', 'Bo'])
  })

  it('returns the SAME array reference when there is no self entry to remove', () => {
    const roster = collapsePresence(state(conn('u-ana', 'a')), ME)
    const { me, others } = partitionSelf(roster)
    expect(me).toBeNull()
    expect(others).toBe(roster)
  })

  it('reports me with no others when I am alone on the board', () => {
    const { me, others } = partitionSelf(collapsePresence(state(conn(ME, 'a')), ME))
    expect(me?.isSelf).toBe(true)
    expect(others).toEqual([])
  })

  it('handles an empty roster', () => {
    expect(partitionSelf([])).toEqual({ me: null, others: [] })
  })
})
