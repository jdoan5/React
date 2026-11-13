/**
 * The front door: which board to open, and whether this visitor may join it.
 *
 * Both decisions are pure so every path can be pinned by a test. The impure
 * halves — reading `location` and localStorage, calling Postgres — live in
 * hooks/useBoardRoute.ts and sync/supabaseAdapter.ts.
 */

import type { ID } from '../types'
import type { BoardRoute } from './boardLink'
import type { RecentBoard } from './recentBoards'

export type Target =
  | { readonly kind: 'open'; readonly boardId: ID; readonly invite: string | null }
  | { readonly kind: 'create' }
  | { readonly kind: 'invalid' }

/**
 * An explicit link always wins. With no link, a returning visitor gets the
 * board they used last; a first-time visitor gets a new one.
 */
export function resolveTarget(route: BoardRoute, recents: readonly RecentBoard[]): Target {
  switch (route.kind) {
    case 'board':
      return { kind: 'open', boardId: route.boardId, invite: route.invite }
    case 'new':
      return { kind: 'create' }
    case 'invalid':
      return { kind: 'invalid' }
    case 'none': {
      const last = recents[0]
      return last ? { kind: 'open', boardId: last.id, invite: null } : { kind: 'create' }
    }
  }
}

export type JoinDecision =
  /** Already on the board — the token is irrelevant, so it is never re-checked. */
  | 'member'
  /** Not yet a member, holding a token: join_board() validates it server-side. */
  | 'join'
  /** Not a member and no token. Refused here with a clear message; the server would refuse too. */
  | 'needs-invite'

export function joinDecision(isMember: boolean, invite: string | null | undefined): JoinDecision {
  if (isMember) return 'member'
  return invite ? 'join' : 'needs-invite'
}

const MAX_TITLE = 80

/**
 * Guests cannot rename boards (0002 has a restrictive policy against it), so
 * every guest-made board would otherwise share one title. Naming it after its
 * creator makes boards tell-apart-able in the recents list.
 */
export function boardTitleFor(creatorName: string): string {
  const name = creatorName.trim() || 'Guest'
  return `${name}'s board`.slice(0, MAX_TITLE)
}

export const NEEDS_INVITE_MESSAGE =
  'You need an invite link to join this board. Ask someone on it for the link, or start your own.'

export const INVALID_LINK_MESSAGE =
  'That invite link is incomplete or mistyped. Ask for it again, or start your own board.'

/** The parts of supabase-js's AuthError this decision needs. */
export interface AuthFailure {
  readonly name?: string
  readonly status?: number
  readonly message: string
}

export interface SignInVerdict {
  readonly reason: 'unavailable' | 'denied'
  readonly message: string
}

/**
 * Was a failed sign-in the server saying no, or the server not answering?
 *
 * Only "no" is terminal, and erring toward terminal is the expensive mistake:
 * a terminal failure makes the front door forget the board, while a wrongly
 * retryable one only costs a click on "Try again".
 *
 *   AuthRetryableFetchError / status 0   never got an answer
 *   408, 5xx                             the server timed out or broke
 *   429                                  rate-limited — Supabase caps anonymous
 *                                        sign-ins per IP, so a classroom behind
 *                                        one NAT hits it; it clears on its own
 *   anything else (400, 422, …)          a real refusal: the provider is off
 */
export function classifySignInFailure(error: AuthFailure): SignInVerdict {
  const status = error.status ?? 0
  if (status === 429) {
    return {
      reason: 'unavailable',
      message: 'Too many sign-ins from this network just now. Wait a few minutes, then try again.',
    }
  }
  if (error.name === 'AuthRetryableFetchError' || status === 0 || status === 408 || status >= 500) {
    return { reason: 'unavailable', message: `Could not reach Supabase to sign in (${error.message}).` }
  }
  return {
    reason: 'denied',
    message:
      `Anonymous sign-in failed (${error.message}). ` +
      'Enable it under Authentication → Sign In / Providers.',
  }
}
