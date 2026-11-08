# Realtime Board

A multiplayer task board on **React 19 + TypeScript + Vite + Supabase**.

The repo's [Workflow Board](../Workflow%20Board) fakes multiplayer: a simulated-collaborator
engine and `localStorage` sync between tabs. This is the honest version — real Postgres, real
auth, real sync between real browsers — and it exists mostly to confront the problem the mock
never had to: **what happens when two people drag the same card at the same time.**

> **Status: stage 1 of 3.** The ordering core is finished and tested, and the board runs on it.
> The command queue and the Supabase adapter are next — see [Build order](#build-order).

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

So the total order breaks ties on id, in the client and in Postgres alike:

```ts
compareOrder = (a, b) => a.orderKey < b.orderKey ? -1
                       : a.orderKey > b.orderKey ?  1
                       : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
```
```sql
select * from cards where column_id = $1 order by order_key collate "C", id;
```

The explicit `collate "C"` matters: a locale-aware collation can sort case-insensitively, which
would disagree with JavaScript's `<` on exactly the mixed-case keys base-62 produces.

## Tested core

All the hard logic is pure — no React, no network, no clock — in `src/lib/`, with **83 Vitest
cases**.

| Module | What it owns |
| --- | --- |
| [`fracIndex.ts`](src/lib/fracIndex.ts) | Key generation, the base-62 encoding, rollover, rebalancing |
| [`ordering.ts`](src/lib/ordering.ts) | The total order, and turning a drop index into one absolute key |

`fracIndex.ts` is an independent implementation of the algorithm Figma and Linear use (David
Greenspan's *Implementing Fractional Indexing*). It is pinned against **golden vectors taken by
running the reference library `fractional-indexing@3.2.0`** — all 21 agree, including the
`az → b00` and `Z0 → Yzz` rollovers and the quirk where the minimum key can be emitted but is
then rejected as input.

The suite also pins the concurrency cases directly: two clients minting the identical key, the
same card moved by both, and moves of different cards never interacting.

## Database

`supabase/migrations/` is written and reviewable before any project exists:

| File | |
| --- | --- |
| `0001_schema.sql` | Tables, the `rev` trigger, indexes, grants |
| `0002_rls.sql` | Row Level Security, and the recursion trap below |
| `0003_rpc.sql` | `create_board` and `join_board` — the two writes RLS cannot express |

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
npm test         # 83 unit tests
npm run build    # type-check + production build
```

No credentials needed. Without `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` the board runs in
**demo mode** — the same pattern as [Interactive Stocks](../Interactive%20Stocks), which falls
back to labelled demo data when its API key is absent.

Each card shows its order key, so you can watch what a drag actually writes: move a card and
exactly one key changes.

## Build order

- [x] **Stage 1 — ordering core.** `fracIndex.ts`, `ordering.ts`, 83 tests, and a board that
      drags through them. Verifiable with no credentials.
- [ ] **Stage 2 — optimistic sync.** `commandQueue.ts`, `project.ts`, `reconcile.ts`. The rule
      is that an optimistic edit is never written into the snapshot: the UI renders
      `project(snapshot, queue)`, which makes rollback a list removal and makes a collaborator's
      echo unable to clobber an in-flight edit. Also verifiable with no credentials — the demo
      adapter takes `latencyMs` and `failureRate` knobs so rollback can be *shown*.
- [ ] **Stage 3 — Supabase.** Anonymous auth, the realtime subscription, presence avatars and
      live cursors, and deployment.

## Credits

Ordering follows David Greenspan's *Implementing Fractional Indexing*; the golden vectors come
from [`fractional-indexing`](https://github.com/rocicorp/fractional-indexing) (MIT), used to
verify this implementation rather than as a dependency.
