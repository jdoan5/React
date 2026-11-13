import { describe, expect, it } from 'vitest'
import { boardTitleFor, classifySignInFailure, joinDecision, resolveTarget } from './frontDoor'
import type { RecentBoard } from './recentBoards'
import { queueStorageKey, QUEUE_STORAGE_KEY, storedQueueFor } from './commandQueue'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const T = '33333333-3333-4333-8333-333333333333'
const recents: RecentBoard[] = [
  { id: A, title: 'Newest', openedAt: 200 },
  { id: B, title: 'Older', openedAt: 100 },
]

describe('resolveTarget', () => {
  it('an invite link opens that board with its token', () => {
    expect(resolveTarget({ kind: 'board', boardId: B, invite: T }, recents)).toEqual({
      kind: 'open',
      boardId: B,
      invite: T,
    })
  })

  it('an explicit link beats the most recent board', () => {
    expect(resolveTarget({ kind: 'board', boardId: B, invite: null }, recents)).toEqual({
      kind: 'open',
      boardId: B,
      invite: null,
    })
  })

  it('a returning visitor with no link lands on their newest board', () => {
    expect(resolveTarget({ kind: 'none' }, recents)).toEqual({ kind: 'open', boardId: A, invite: null })
  })

  it('a first-time visitor with no link gets a new board', () => {
    expect(resolveTarget({ kind: 'none' }, [])).toEqual({ kind: 'create' })
  })

  it('#new creates even when there are recent boards', () => {
    expect(resolveTarget({ kind: 'new' }, recents)).toEqual({ kind: 'create' })
  })

  it('a mangled link is an error, never a silent new board', () => {
    expect(resolveTarget({ kind: 'invalid' }, recents)).toEqual({ kind: 'invalid' })
  })
})

describe('joinDecision', () => {
  it.each([
    [true, T, 'member'],
    [true, null, 'member'], // members reopen from history with no token
    [false, T, 'join'],
    [false, null, 'needs-invite'],
    [false, undefined, 'needs-invite'],
    [false, '', 'needs-invite'],
  ] as const)('member=%s invite=%j → %s', (isMember, invite, expected) => {
    expect(joinDecision(isMember, invite)).toBe(expected)
  })
})

describe('boardTitleFor', () => {
  it('names the board after its creator', () => {
    expect(boardTitleFor('Swift Vole')).toBe("Swift Vole's board")
  })

  it('falls back for a blank name', () => {
    expect(boardTitleFor('   ')).toBe("Guest's board")
  })

  it('fits the 80-character title check in 0001', () => {
    expect(boardTitleFor('x'.repeat(200)).length).toBeLessThanOrEqual(80)
  })
})

describe('queueStorageKey', () => {
  it('gives every board its own queue', () => {
    expect(queueStorageKey(A)).not.toBe(queueStorageKey(B))
  })

  it('namespaces under the existing versioned key', () => {
    expect(queueStorageKey(A)).toBe(`${QUEUE_STORAGE_KEY}:${A}`)
  })
})

describe('classifySignInFailure', () => {
  it.each([
    [{ name: 'AuthRetryableFetchError', status: 0, message: 'Failed to fetch' }, 'a dropped request'],
    [{ status: 0, message: 'offline' }, 'status 0'],
    [{ status: 408, message: 'timeout' }, 'a timeout'],
    [{ status: 500, message: 'boom' }, 'a 500'],
    [{ status: 503, message: 'down' }, 'a 503'],
    [{ name: 'AuthRetryableFetchError', status: 522, message: 'cf' }, 'a Cloudflare 52x'],
  ])('%o is retryable (%s) — never forgets a board', (error, _why) => {
    expect(classifySignInFailure(error).reason).toBe('unavailable')
  })

  it('treats a 429 as retryable, with copy that says to wait', () => {
    const verdict = classifySignInFailure({ status: 429, message: 'rate limit' })
    expect(verdict.reason).toBe('unavailable')
    expect(verdict.message).toMatch(/wait a few minutes/i)
  })

  it.each([
    [{ status: 422, message: 'Anonymous sign-ins are disabled' }],
    [{ status: 400, message: 'bad request' }],
    [{ name: 'AuthApiError', status: 403, message: 'forbidden' }],
  ])('%o is a real refusal, pointing at the dashboard toggle', (error) => {
    const verdict = classifySignInFailure(error)
    expect(verdict.reason).toBe('denied')
    expect(verdict.message).toMatch(/Sign In \/ Providers/)
  })

  it('keeps the library message for diagnosis', () => {
    expect(classifySignInFailure({ status: 503, message: 'upstream down' }).message).toContain('upstream down')
  })
})

describe('storedQueueFor', () => {
  const OWN = '{"own":1}'
  const OLD = '{"old":1}'

  it("a board's own queue always wins", () => {
    expect(storedQueueFor(OWN, OLD, 'local')).toBe(OWN)
    expect(storedQueueFor(OWN, OLD, 'supabase')).toBe(OWN)
  })

  it('demo mode adopts the pre-per-board queue once', () => {
    expect(storedQueueFor(null, OLD, 'local')).toBe(OLD)
  })

  it('live mode never adopts it — nothing under the old key was ever its', () => {
    expect(storedQueueFor(null, OLD, 'supabase')).toBeNull()
  })

  it('nothing stored anywhere starts empty', () => {
    expect(storedQueueFor(null, null, 'local')).toBeNull()
  })
})
