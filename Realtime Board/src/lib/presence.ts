/**
 * Presence — turning Supabase's presence map into the avatar row.
 *
 * WHY THIS EXISTS
 * ---------------
 * `presenceState()` does not return a list of people. It returns
 * `{ [presenceKey]: Presence[] }` — an ARRAY per key, because one key can hold
 * several connections, and a key is per-connection to begin with. Flatten that and
 * render it, and one person with three tabs open becomes three avatars: three
 * "collaborators" who are all the same human, all idle, all fake. That phantom
 * collaborator is precisely the illusion the old Workflow Board's simulated engine
 * produced, and this app exists to stop faking it. So the roster is collapsed by
 * `userId` and the duplicates are reported honestly, as `tabs: n`.
 *
 * WHY IT IS DEFENSIVE
 * -------------------
 * Every entry except my own was authored by SOMEONE ELSE'S CLIENT. It arrives over
 * a socket as whatever JSON that client chose to send — a half-deployed version, a
 * tab that was mid-refresh, or someone with the console open. A malformed entry is
 * therefore a normal event, not an exception: it is dropped and the rest of the
 * roster still renders. One bad peer must never blank the avatar row, which is what
 * a throw in here would do, since this runs inside the `sync` handler.
 *
 * WHY IT IS PURE
 * --------------
 * No clock: `presencePayload` is handed `now`. That is what makes the behaviour
 * below testable without faking timers, and it is the same rule the rest of
 * `src/lib` follows.
 *
 * WHY WHOLESALE, NEVER DELTAS
 * ---------------------------
 * A `sync` event legitimately reports joins and leaves for users who did not move,
 * so applying them incrementally drifts. The roster is rebuilt from the whole map
 * every time; this function is the rebuild.
 */

import type { Collaborator, ID } from '../types'

/**
 * One connection, as it appears in `presenceState()`.
 *
 * `presence_ref` is minted by Realtime itself when `track()` is called — it is
 * absent from the payload we SEND and present on everything the map hands back,
 * which is why it is optional here rather than two near-identical types. We never
 * treat it as identity; it identifies a socket, and sockets are what we are
 * collapsing away.
 */
export interface PresenceEntry {
  readonly presence_ref?: string
  readonly userId: ID
  readonly name: string
  readonly color: string
  /** Sender clock. Advisory: it only ranks competing labels for one human. */
  readonly at: number
}

/**
 * A collaborator plus "is this me".
 *
 * `Collaborator` lives in `src/types.ts` and does not carry this flag, so the
 * roster widens it here instead: a `RosterEntry[]` is still assignable to the
 * `readonly Collaborator[]` that `SyncHandlers.onPresence` takes, and the UI that
 * wants to render "you" has something to read. Self is KEPT in the roster — a
 * board that shows everyone but me is a board that looks like I am not on it.
 */
export interface RosterEntry extends Collaborator {
  readonly isSelf: boolean
}

/** A string that would actually render. Blank or whitespace-only is a broken avatar. */
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/**
 * One entry, or null if it is not usable.
 *
 * The three identity fields are required because a collaborator without them is
 * not a collaborator — there is nothing to key on, label, or colour. `at` is not:
 * it only decides which of one human's tabs supplies the label, so a peer that
 * sends garbage there degrades to "oldest" rather than vanishing from the board.
 */
function parseEntry(value: unknown): PresenceEntry | null {
  if (typeof value !== 'object' || value === null) return null

  const raw = value as Record<string, unknown>
  const userId = text(raw['userId'])
  const name = text(raw['name'])
  const color = text(raw['color'])
  if (userId === null || name === null || color === null) return null

  const at = typeof raw['at'] === 'number' && Number.isFinite(raw['at']) ? raw['at'] : 0
  const ref = text(raw['presence_ref'])
  const entry: PresenceEntry = { userId, name, color, at }
  return ref === null ? entry : { ...entry, presence_ref: ref }
}

/**
 * Which of two entries for the SAME human supplies the name and colour.
 *
 * Newest `at` wins, so renaming yourself in one tab updates the avatar rather than
 * losing to whichever tab happens to be listed first. The lexicographic tiebreak
 * is not cosmetic: the only other ordering available is the presence map's key
 * iteration order, which is insertion order and therefore differs between clients.
 * Two clients looking at the same board must compute the same roster, so the
 * tiebreak has to come from the data.
 */
function winsLabel(candidate: PresenceEntry, current: PresenceEntry): boolean {
  if (candidate.at !== current.at) return candidate.at > current.at
  if (candidate.name !== current.name) return candidate.name < current.name
  return candidate.color < current.color
}

interface Group {
  label: PresenceEntry
  /** Distinct sockets. A duplicated entry is one connection listed twice, not two tabs. */
  readonly refs: Set<string>
  /** Entries with no usable `presence_ref`; each counts as its own connection. */
  unreffed: number
}

/**
 * Deterministic, locale-independent: name, then `userId`.
 *
 * `localeCompare` is tempting for names but depends on the runtime's ICU data, so
 * two browsers could order the same roster differently. Code-unit order is the same
 * everywhere, which is the property that matters here — the avatar row must not
 * reshuffle when an unrelated person joins, on anyone's screen. `userId` is unique
 * per group, so the order is total and the output does not depend on the order the
 * entries were visited in.
 */
function compareRoster(a: RosterEntry, b: RosterEntry): number {
  if (a.name !== b.name) return a.name < b.name ? -1 : 1
  if (a.userId !== b.userId) return a.userId < b.userId ? -1 : 1
  return 0
}

/**
 * The avatar row, rebuilt from a whole `presenceState()` map.
 *
 * `selfUserId` only flags; it never filters — see `RosterEntry`.
 */
export function collapsePresence(
  state: Readonly<Record<string, readonly unknown[]>>,
  selfUserId: ID,
): readonly RosterEntry[] {
  if (typeof state !== 'object' || state === null) return []

  // A Map, not a plain object: `userId` is attacker-controlled, and a peer calling
  // itself `__proto__` or `constructor` would collide with Object.prototype.
  const groups = new Map<ID, Group>()

  for (const entries of Object.values(state)) {
    // The parameter type says "array"; that is a claim about what Supabase returns,
    // not a guarantee about what came off the wire.
    if (!Array.isArray(entries)) continue

    for (const value of entries) {
      const entry = parseEntry(value)
      if (entry === null) continue

      const group = groups.get(entry.userId)
      if (group === undefined) {
        groups.set(entry.userId, {
          label: entry,
          refs: entry.presence_ref === undefined ? new Set() : new Set([entry.presence_ref]),
          unreffed: entry.presence_ref === undefined ? 1 : 0,
        })
        continue
      }
      if (entry.presence_ref === undefined) group.unreffed += 1
      else group.refs.add(entry.presence_ref)
      if (winsLabel(entry, group.label)) group.label = entry
    }
  }

  const roster: RosterEntry[] = []
  for (const [userId, group] of groups) {
    roster.push({
      userId,
      name: group.label.name,
      color: group.label.color,
      tabs: group.refs.size + group.unreffed,
      isSelf: userId === selfUserId,
    })
  }
  return roster.sort(compareRoster)
}

/**
 * The payload to hand `track()`. Time is passed in.
 *
 * `tabs` is deliberately not sent. It is derived from how many connections the map
 * actually holds, and a client that published its own count could inflate the
 * roster or simply be wrong about it after a tab closed.
 */
export function presencePayload(me: Collaborator, now: number): PresenceEntry {
  return { userId: me.userId, name: me.name, color: me.color, at: now }
}

/**
 * Split the roster into me and everyone else, which is the shape the UI wants:
 * "you" renders differently, and the overflow count is of other people.
 *
 * `me` is null when my own presence has not come back yet — a real state, between
 * `track()` and the first `sync`. When there is nothing of mine to remove, `others`
 * is the SAME array reference, so React can skip the row.
 */
export function partitionSelf(roster: readonly RosterEntry[]): {
  readonly me: RosterEntry | null
  readonly others: readonly RosterEntry[]
} {
  const me = roster.find((entry) => entry.isSelf) ?? null
  if (me === null) return { me, others: roster }
  return { me, others: roster.filter((entry) => !entry.isSelf) }
}
