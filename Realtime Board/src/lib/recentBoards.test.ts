import { describe, expect, it } from 'vitest'
import {
  forgetBoard,
  MAX_RECENTS,
  parseRecents,
  RECENTS_STORAGE_KEY,
  recentLabels,
  rememberBoard,
  serializeRecents,
  type RecentBoard,
} from './recentBoards'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const entry = (n: number, openedAt: number, title = `Board ${n}`): RecentBoard => ({ id: id(n), title, openedAt })

describe('parseRecents', () => {
  it.each([null, '', 'not json', '{}', '42', '"a string"'])('%j → empty list', (raw) => {
    expect(parseRecents(raw)).toEqual([])
  })

  it('round-trips through serializeRecents', () => {
    const list = [entry(1, 300), entry(2, 200)]
    expect(parseRecents(serializeRecents(list))).toEqual(list)
  })

  it('drops bad entries but keeps the good ones', () => {
    const raw = JSON.stringify([
      entry(1, 100),
      { id: 'demo-board', title: 'x', openedAt: 1 },
      { id: id(2), title: 5, openedAt: 1 },
      { id: id(3), title: 'x', openedAt: 'yesterday' },
      { id: id(4), title: 'x', openedAt: Infinity },
      null,
      'junk',
      entry(5, 50),
    ])
    expect(parseRecents(raw).map((e) => e.id)).toEqual([id(1), id(5)])
  })

  it('sorts newest first', () => {
    const raw = serializeRecents([entry(1, 100), entry(2, 300), entry(3, 200)])
    expect(parseRecents(raw).map((e) => e.openedAt)).toEqual([300, 200, 100])
  })

  it('keeps only the newest entry per board', () => {
    const raw = serializeRecents([entry(1, 100, 'old'), entry(1, 200, 'new')])
    expect(parseRecents(raw)).toEqual([entry(1, 200, 'new')])
  })

  it('caps the list', () => {
    const many = Array.from({ length: MAX_RECENTS + 5 }, (_, i) => entry(i, i))
    expect(parseRecents(serializeRecents(many))).toHaveLength(MAX_RECENTS)
  })

  it('lower-cases stored ids', () => {
    const raw = JSON.stringify([{ id: id(1).toUpperCase(), title: 't', openedAt: 1 }])
    expect(parseRecents(raw)[0]!.id).toBe(id(1))
  })
})

describe('rememberBoard', () => {
  it('adds a new board at the front', () => {
    const list = rememberBoard([entry(1, 100)], { id: id(2), title: 'New' }, 500)
    expect(list).toEqual([entry(2, 500, 'New'), entry(1, 100)])
  })

  it('moves a revisited board to the front instead of duplicating it', () => {
    const list = rememberBoard([entry(1, 100), entry(2, 200)], { id: id(1), title: 'Board 1' }, 500)
    expect(list.map((e) => e.id)).toEqual([id(1), id(2)])
    expect(list).toHaveLength(2)
  })

  it('keeps the known title when the new one is empty', () => {
    // Opening a board from a link records it before its title has loaded.
    const list = rememberBoard([entry(1, 100, 'Swift Vole\'s board')], { id: id(1), title: '' }, 500)
    expect(list[0]).toEqual(entry(1, 500, 'Swift Vole\'s board'))
  })

  it('matches ids case-insensitively', () => {
    const list = rememberBoard([entry(1, 100)], { id: id(1).toUpperCase(), title: 'x' }, 500)
    expect(list).toHaveLength(1)
  })

  it('drops the oldest beyond the cap', () => {
    const full = Array.from({ length: MAX_RECENTS }, (_, i) => entry(i, i + 1))
    const list = rememberBoard(full, { id: id(999), title: 'x' }, 10_000)
    expect(list).toHaveLength(MAX_RECENTS)
    expect(list[0]!.id).toBe(id(999))
    expect(list.some((e) => e.id === id(0))).toBe(false)
  })
})

describe('forgetBoard', () => {
  it('removes a board', () => {
    expect(forgetBoard([entry(1, 1), entry(2, 2)], id(1))).toEqual([entry(2, 2)])
  })

  it('is a no-op for an unknown board', () => {
    const list = [entry(1, 1)]
    expect(forgetBoard(list, id(9))).toEqual(list)
  })

  it('matches ids case-insensitively', () => {
    expect(forgetBoard([entry(1, 1)], id(1).toUpperCase())).toEqual([])
  })
})

it('uses a versioned storage key', () => {
  expect(RECENTS_STORAGE_KEY).toBe('realtime-board:boards:v1')
})

describe('recentLabels', () => {
  it('uses the plain title when it is unique', () => {
    expect(recentLabels([entry(1, 2, 'Alpha'), entry(2, 1, 'Beta')])).toEqual(
      new Map([
        [id(1), 'Alpha'],
        [id(2), 'Beta'],
      ]),
    )
  })

  it("tells apart one guest's identically titled boards", () => {
    const labels = recentLabels([entry(1, 3, "Swift Vole's board"), entry(2, 2, "Swift Vole's board"), entry(3, 1, 'Other')])
    expect(labels.get(id(1))).not.toBe(labels.get(id(2)))
    expect(labels.get(id(1))).toBe(`Swift Vole's board · ${id(1).slice(-4)}`)
    expect(labels.get(id(3))).toBe('Other')
  })

  it('names untitled boards, and tells duplicates of those apart too', () => {
    const labels = recentLabels([entry(1, 2, ''), entry(2, 1, '')])
    expect(labels.get(id(1))).toMatch(/^Untitled board · /)
    expect(labels.get(id(1))).not.toBe(labels.get(id(2)))
  })

  it('is stable when the list is reordered', () => {
    const a = recentLabels([entry(1, 2, 'Same'), entry(2, 1, 'Same')])
    const b = recentLabels([entry(2, 9, 'Same'), entry(1, 8, 'Same')])
    expect(a.get(id(1))).toBe(b.get(id(1)))
  })

  it('grows the suffix until ids that share an ending are still told apart', () => {
    const a = 'aaaaaaaa-0000-4000-8000-00000000beef'
    const b = 'bbbbbbbb-0000-4000-8000-00000001beef' // same last 4 and last 7
    const labels = recentLabels([
      { id: a, title: 'Same', openedAt: 2 },
      { id: b, title: 'Same', openedAt: 1 },
    ])
    expect(labels.get(a)).not.toBe(labels.get(b))
  })
})
