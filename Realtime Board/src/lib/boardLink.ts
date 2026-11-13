/**
 * A board's address — read from and written to the URL fragment.
 *
 *   #board=<uuid>                     open a board I already belong to
 *   #board=<uuid>&invite=<uuid>       join it with its share token
 *   #new                              create a fresh board
 *
 * Why the fragment: everything after `#` stays in the browser. It is never sent
 * in the HTTP request, never logged by a server or CDN, and never leaks to
 * another site in a Referer header. The invite token is a capability — anyone
 * holding it can join the board — so it lives where the network never sees it.
 *
 * Pure: strings in, strings out. Nothing here touches `location`.
 */

import type { ID } from '../types'

export type BoardRoute =
  | { readonly kind: 'none' }
  | { readonly kind: 'new' }
  | { readonly kind: 'board'; readonly boardId: ID; readonly invite: string | null }
  /** A `board=` or `invite=` that is not a UUID — a mangled or truncated link. */
  | { readonly kind: 'invalid' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

/**
 * A fragment that says nothing about boards (`''`, `'#'`, `'#top'`) is `none`,
 * not `invalid`: only a link that TRIES to name a board and gets it wrong
 * deserves an error, so an unrelated anchor never blocks the app.
 */
export function parseBoardHash(hash: string): BoardRoute {
  const body = hash.startsWith('#') ? hash.slice(1) : hash
  if (body === 'new') return { kind: 'new' }

  const params = new URLSearchParams(body)
  const board = params.get('board')
  if (board === null) return { kind: 'none' }
  if (!isUuid(board)) return { kind: 'invalid' }

  const invite = params.get('invite')
  if (invite !== null && !isUuid(invite)) return { kind: 'invalid' }

  // Lower-cased so the same board never appears twice in the recents list
  // because someone retyped its link in capitals.
  return { kind: 'board', boardId: board.toLowerCase(), invite: invite?.toLowerCase() ?? null }
}

export function boardHash(boardId: ID, invite: string | null = null): string {
  const params = new URLSearchParams({ board: boardId })
  if (invite) params.set('invite', invite)
  return `#${params.toString()}`
}

/** The link to send someone. `pageUrl` may carry a fragment; it is replaced. */
export function inviteUrl(pageUrl: string, boardId: ID, invite: string): string {
  const cut = pageUrl.indexOf('#')
  return (cut === -1 ? pageUrl : pageUrl.slice(0, cut)) + boardHash(boardId, invite)
}
