# Realtime Board

> **🔗 Live: https://realtime-board-gamma.vercel.app**

A multiplayer task board on **React 19 + TypeScript + Vite + Supabase**.

The repo's [Workflow Board](../Workflow%20Board) fakes multiplayer: a simulated-collaborator
engine and `localStorage` sync between tabs. This is the honest version — real Postgres, real
auth, real sync between real browsers — and it exists mostly to confront the problem the mock
never had to: **what happens when two people drag the same card at the same time.**

> **Two modes.** With no credentials it runs as a labelled demo that syncs between tabs of one
> browser. Point it at a Supabase project ([setup](supabase/README.md)) and it becomes real
> multiplayer: every visitor gets a board of their own, and an invite link brings anyone else onto
> it. **442 Vitest cases.**

## The problem this is about

Order cards with an integer `position` and concurrency breaks it three ways at once:

- Two clients compute `position = 3`, both write, one silently loses.
- Closing the gap means renumbering the column — one drag becomes N row writes, each
  conflicting independently.
- The drop index was computed against a list that has since changed underneath you.

The fix is a **fractional index**: `order_key text`, a self-delimiting base-62 string that sorts
lexicographically. To place a card between two neighbours you mint a key strictly between
theirs, so **a move writes exactly one row and touches no neighbour**.

```
before   a0        a1        a2
drop ────────► between a0 and a1
after    a0   a0V  a1        a2      ← one UPDATE; a1 and a2 never written
```

Strings rather than floats because a double exhausts its mantissa after ~50 inserts into the
same gap and then silently returns a value equal to a neighbour. A string can always grow one
more character — measured cost is about **one byte per six adversarial drags into the identical
slot**, and nothing at all for ordinary appends.

### The part that is easy to get wrong

`keyBetween` is deterministic, so two clients dropping between the same neighbours both compute
the same key — say `a0V`. That is a **tie, not corruption**: both rows are valid and both
survive. But sort on the key alone and the pair's relative order is *undefined*, so two clients
can render them in opposite orders permanently, with neither ever correcting.

So the total order breaks ties on id:

```ts
compareOrder = (a, b) => a.orderKey < b.orderKey ? -1
                       : a.orderKey > b.orderKey ?  1
                       : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
```

Ordering happens in the client — `fetchSnapshot` selects rows and sorts them with
`compareOrder`, so no query carries an `ORDER BY`. But the schema still has to agree with
JavaScript, because the moment anything *does* order in SQL the two must not disagree. So
`order_key` is declared `collate "C"`:

```sql
order_key text collate "C" not null check (char_length(order_key) between 2 and 64)
```

That is load-bearing, not cosmetic. Base-62 keys mix case, and `keyBetween(null, 'a0')` emits
`'Zz'` — a key whose whole job is to sort *before* `a0`. Byte order puts it there. A
locale-aware collation, which is the cluster default on Supabase, sorts case-insensitively and
puts it last:

```
byte  order:  A0  Zy  Zz  a0  a0V  a1  azz  b00     ← agrees with JavaScript `<`
en-US order:  a0  A0  a0V  a1  azz  b00  Zy  Zz     ← prepend key lands at the end
```

Declaring it on the column rather than per query means every comparison and every index on
`order_key` is byte-ordered by default, so a future `order by order_key, id` is correct and
index-backed without anyone having to remember the `collate`.

## Tested core

**442 Vitest cases** over the pure modules listed under [Modules](#modules).

`fracIndex.ts` is an independent implementation of the algorithm Figma and Linear use (David
Greenspan's *Implementing Fractional Indexing*). It is pinned against **golden vectors taken
by running the reference library `fractional-indexing@3.2.0`** — all 15 agree, including the
`az → b00` and `Z0 → Yzz` rollovers and the quirk where the minimum key can be emitted but is
then rejected as input.

The suite pins the concurrency cases rather than hoping for them: two clients minting the
identical key, the same card moved by both, a forged `origin_cmd_id` failing to ack someone
else's command, a stale event returning the *same* snapshot reference so React skips the
render, and a malformed presence entry being dropped instead of blanking the roster.

## Database

`supabase/migrations/` is written and reviewable before any project exists:

| File | |
| --- | --- |
| `0001_schema.sql` | Tables, the `rev` trigger, indexes, grants |
| `0002_rls.sql` | Row Level Security, and the recursion trap below |
| `0003_rpc.sql` | `create_board` and `join_board` — the two writes RLS cannot express |
| `0004_realtime.sql` | Realtime Authorization — RLS on `realtime.messages` |
| `0005_front_door.sql` | `create_board` with the four default columns; a race-free `join_board` |

Three decisions worth calling out:

- **Ids are client-minted**, so a retried insert is an upsert rather than a duplicate card.
- **Deletes are soft.** Postgres cannot apply RLS to a `DELETE` — there is no row left to check
  — so delete events reach every subscriber regardless of policy and carry only the primary key.
  An archive is an ordinary `UPDATE`: policy-checked, and it ships the whole row. The `DELETE`
  grant is revoked to make that structural rather than a convention.
- **`rev` is server-owned** by trigger, so a client cannot insert at rev 999 to pin a row, and
  the client can discard any event that is not strictly newer than what it holds.

### The recursion trap

The natural policy on `boards` is "I am a member of this board", which reads `board_members`.
The natural policy on `board_members` is "members of boards I can see", which reads `boards`.
Postgres then raises `42P17: infinite recursion detected in policy` and **both tables become
unreadable** — not slow, not wrong, unreadable.

The fix is a `security definer` helper owned by `postgres` (which has `bypassrls`) in a
*private* schema, never `public` — a `security definer` function in `public` is callable over
the Data API with its owner's privileges. Both tables' policies call the helper; neither reads
the other.

## Getting started

```bash
npm install
npm run dev      # http://localhost:5178
npm test         # 442 unit tests
npm run build    # type-check + production build
```

No credentials needed. Without `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` the board runs in
**demo mode** — the same pattern as [Interactive Stocks](../Interactive%20Stocks), which falls
back to labelled demo data when its API key is absent.

Each card shows its order key, so you can watch what a drag actually writes: move a card and
exactly one key changes.

## Boards and invite links

With Supabase connected, the app has a front door — the part that decides which board you are
looking at:

| You open… | You get |
| --- | --- |
| the site with no link, for the first time | a new board of your own, with Backlog → Done already in place |
| the site with no link, again | the board you used last |
| an invite link | that board — you join it, and it joins your list |
| **New board** | another board of your own |

**Copy invite link** puts the board's link on your clipboard, and anyone who opens it joins as an
editor. The share token rides in the URL *fragment* — `#board=…&invite=…` — and everything after
`#` stays in the browser: it is never sent to a server, never logged, never leaked in a
`Referer` header.

Membership lives in Postgres, so a member never needs the token again. This browser keeps only a
list of board ids to come back to — no tokens. Unsent edits are queued per board, so a change
made on one board can never replay against another.

Setup is a free Supabase project and about ten minutes: [`supabase/README.md`](supabase/README.md).

## How the sync works

**The one rule: an optimistic edit is never written into the snapshot.**

The snapshot holds only what the server has confirmed. The queue holds only what this client
has asked for. They never touch, and the UI renders `project(snapshot, queue)`. Everything
hard falls out of that separation:

| | |
| --- | --- |
| optimistic apply | enqueue a command; the projection shows it next render |
| rollback | drop the command and re-project — there is no saved copy to restore |
| echo safety | a collaborator's change lands in the snapshot *underneath* my pending edit, so their rename and my move both survive |
| retry | the command is still in the queue; there is nothing to reconstruct |

The usual alternative — write optimistically into the cache, stash a backup, restore it on
failure — needs a cancel-in-flight-refetch interlock so a concurrent echo cannot clobber the
optimistic write. Here that interlock does not exist, because the problem does not.

Commands carry **absolute target state**, never a delta. Re-applying `{ orderKey: 'a1V' }`
twice is a no-op; re-applying `{ delta: +1 }` twice is a corruption. That one rule is what
makes replay-after-reload safe, lets a retry be an upsert on a client-minted id, and lets
three quick drags of one card coalesce into a single write.

### Try the failure path

The demo adapter has two chaos knobs, and they are the reason any of this is demonstrable
without an account. Turn **failure rate** up and drag a card: it moves instantly, retries on
the backoff schedule, and then rolls back with the reason surfaced. Turn **latency** up and
cards show `saving…` while the write is in the air.

## Modules

All pure — no React, no network, no clock. Time and randomness are arguments.

| Module | What it owns |
| --- | --- |
| [`fracIndex.ts`](src/lib/fracIndex.ts) | Key generation, base-62 encoding, rollover, rebalancing |
| [`ordering.ts`](src/lib/ordering.ts) | The total order; drop index → one absolute key |
| [`commandQueue.ts`](src/lib/commandQueue.ts) | The unconfirmed-intent FIFO: supersede, ack, retry, terminal rejection, persistence |
| [`project.ts`](src/lib/project.ts) | `snapshot + queue → what renders` |
| [`reconcile.ts`](src/lib/reconcile.ts) | Folding server events in, monotonically by `rev` |
| [`presence.ts`](src/lib/presence.ts) | Collapsing one human's many tabs into one collaborator |
| [`cursors.ts`](src/lib/cursors.ts) | Merge, TTL eviction, clamping, send-throttle |
| [`backoff.ts`](src/lib/backoff.ts) | The retry schedule, matching realtime-js's own intervals |
| [`boardLink.ts`](src/lib/boardLink.ts) | Reading and writing `#board=…&invite=…` |
| [`recentBoards.ts`](src/lib/recentBoards.ts) | The boards this browser has opened, newest first |
| [`frontDoor.ts`](src/lib/frontDoor.ts) | Which board to open, and whether this visitor may join it |

Cursors are deliberately **not** in the board reducer. At 20Hz with four people that is 80
state updates a second, each re-running `project()` and re-rendering the board to move a few
absolutely-positioned divs. They live in a separate `useSyncExternalStore` store that only
the cursor layer subscribes to.

## Credits

Ordering follows David Greenspan's *Implementing Fractional Indexing*; the golden vectors come
from [`fractional-indexing`](https://github.com/rocicorp/fractional-indexing) (MIT), used to
verify this implementation rather than as a dependency.
