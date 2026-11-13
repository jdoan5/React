import { describe, expect, it } from 'vitest'
import { boardHash, inviteUrl, isUuid, parseBoardHash } from './boardLink'

const BOARD = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e'
const TOKEN = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'

describe('isUuid', () => {
  it.each([
    [BOARD, true],
    [BOARD.toUpperCase(), true],
    ['demo-board', false], // the demo board's id — exactly what Postgres rejected
    ['', false],
    [`${BOARD}x`, false],
    [BOARD.slice(0, 35), false], // a link truncated by one character
    [123, false],
    [null, false],
  ])('%s → %s', (value, expected) => {
    expect(isUuid(value)).toBe(expected)
  })
})

describe('parseBoardHash', () => {
  it.each(['', '#', '#top', '#foo=bar'])('%j names no board → none', (hash) => {
    expect(parseBoardHash(hash)).toEqual({ kind: 'none' })
  })

  it('#new asks for a fresh board', () => {
    expect(parseBoardHash('#new')).toEqual({ kind: 'new' })
  })

  it('reads a board with no token', () => {
    expect(parseBoardHash(`#board=${BOARD}`)).toEqual({ kind: 'board', boardId: BOARD, invite: null })
  })

  it('reads a board with its invite token', () => {
    expect(parseBoardHash(`#board=${BOARD}&invite=${TOKEN}`)).toEqual({
      kind: 'board',
      boardId: BOARD,
      invite: TOKEN,
    })
  })

  it('does not care about parameter order', () => {
    expect(parseBoardHash(`#invite=${TOKEN}&board=${BOARD}`)).toEqual({
      kind: 'board',
      boardId: BOARD,
      invite: TOKEN,
    })
  })

  it('accepts a fragment without the leading #', () => {
    expect(parseBoardHash(`board=${BOARD}`)).toEqual({ kind: 'board', boardId: BOARD, invite: null })
  })

  it('lower-cases ids so one board never appears twice', () => {
    expect(parseBoardHash(`#board=${BOARD.toUpperCase()}&invite=${TOKEN.toUpperCase()}`)).toEqual({
      kind: 'board',
      boardId: BOARD,
      invite: TOKEN,
    })
  })

  it.each([
    ['#board=demo-board', 'a non-uuid board'],
    [`#board=${BOARD.slice(0, 30)}`, 'a truncated board id'],
    [`#board=${BOARD}&invite=nope`, 'a malformed token'],
    [`#board=${BOARD}&invite=`, 'an empty token'],
    ['#board=', 'an empty board'],
  ])('%s → invalid (%s)', (hash) => {
    expect(parseBoardHash(hash)).toEqual({ kind: 'invalid' })
  })
})

describe('boardHash', () => {
  it('builds a member link', () => {
    expect(boardHash(BOARD)).toBe(`#board=${BOARD}`)
  })

  it('builds an invite link', () => {
    expect(boardHash(BOARD, TOKEN)).toBe(`#board=${BOARD}&invite=${TOKEN}`)
  })

  it('treats a null token as no token', () => {
    expect(boardHash(BOARD, null)).toBe(`#board=${BOARD}`)
  })

  it('round-trips through parseBoardHash', () => {
    expect(parseBoardHash(boardHash(BOARD, TOKEN))).toEqual({ kind: 'board', boardId: BOARD, invite: TOKEN })
    expect(parseBoardHash(boardHash(BOARD))).toEqual({ kind: 'board', boardId: BOARD, invite: null })
  })
})

describe('inviteUrl', () => {
  it('appends the invite fragment to a bare page URL', () => {
    expect(inviteUrl('https://example.app/', BOARD, TOKEN)).toBe(
      `https://example.app/#board=${BOARD}&invite=${TOKEN}`,
    )
  })

  it('replaces any fragment already on the page URL', () => {
    expect(inviteUrl(`https://example.app/#board=${BOARD}`, BOARD, TOKEN)).toBe(
      `https://example.app/#board=${BOARD}&invite=${TOKEN}`,
    )
  })

  it('keeps the path and query string', () => {
    expect(inviteUrl('https://example.app/app?x=1#new', BOARD, TOKEN)).toBe(
      `https://example.app/app?x=1#board=${BOARD}&invite=${TOKEN}`,
    )
  })

  it('puts the token after # so it never reaches the server', () => {
    const url = new URL(inviteUrl('https://example.app/', BOARD, TOKEN))
    expect(url.search).toBe('')
    expect(url.hash).toContain(TOKEN)
  })
})
