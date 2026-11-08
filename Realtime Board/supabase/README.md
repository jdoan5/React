# Supabase setup

The app runs without any of this — with no `.env` it uses the local adapter and syncs between
tabs over a `BroadcastChannel`. Follow these steps only when you want real multiplayer between
real browsers.

## 1. Create a project

<https://supabase.com/dashboard> → **New project**. The free tier is enough.

## 2. Run the migrations

In order, via the SQL editor or the CLI:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

| File | What it does |
| --- | --- |
| `0001_schema.sql` | Tables, the `rev` trigger, indexes, grants |
| `0002_rls.sql` | Row Level Security, and the recursion-trap helper |
| `0003_rpc.sql` | `create_board` / `join_board` |
| `0004_realtime.sql` | Publication + Realtime Authorization policies |

## 3. Things no migration can express

These are dashboard settings, and the app will not work without the first one.

1. **Enable anonymous sign-in** — Authentication → Sign In / Providers → *Anonymous Sign-Ins*.
   Off by default. Without it, `signInAnonymously()` fails and nobody can load a board.

2. **Audit your RLS before you flip that toggle.** An anonymous user is issued the
   **`authenticated`** Postgres role — the same role as a signed-up user — so every
   `to authenticated` policy starts applying to guests the moment anonymous sign-in is on.
   This schema accounts for that (`private.is_guest()`), but anything you add later must too.

3. **Shorten the JWT expiry** — Authentication → Sessions. Realtime caches a connection's
   authorization decision, so a revoked membership keeps working until the client reconnects
   or its token refreshes.

4. **Prune guest users.** Anonymous users are *never* cleaned up automatically, so they
   accumulate in `auth.users` forever. Enable `pg_cron` and schedule something like:

   ```sql
   select cron.schedule('prune-guests', '0 3 * * *', $$
     delete from auth.users
     where is_anonymous is true and created_at < now() - interval '30 days'
   $$);
   ```

## 4. Point the app at it

```bash
cp .env.example .env
```

Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from Project Settings → API.

Both are safe in client-side code — the anon/publishable key is *designed* to be public, and
RLS is what actually enforces access. **Never** put a `service_role` (secret) key in a
`VITE_`-prefixed variable: Vite inlines those into the bundle it ships to the browser.

## Why these choices

**Soft deletes.** Postgres cannot apply RLS to a `DELETE` — there is no row left to check
access against — so delete events are broadcast to every subscriber regardless of policy, and
they carry only the primary key. Archiving is an ordinary `UPDATE`: policy-checked, and it
ships the whole row. The `DELETE` grant is revoked so this is structural, not a convention.

**No `replica identity full`.** It is the usual advice for getting the old row, but with RLS
enabled `old` still arrives holding only the primary key and there is no workaround. It would
cost WAL volume and buy nothing. The client diffs against its own snapshot.

**The recursion trap.** A policy on `boards` that reads `board_members`, plus a policy on
`board_members` that reads `boards`, makes Postgres raise `42P17` and renders *both tables
unreadable*. `private.board_role()` is `security definer` and owned by `postgres`
(which has `bypassrls`), so it breaks the cycle. It lives in a **private** schema because a
`security definer` function in `public` is callable over the Data API with its owner's
privileges.

**`(select auth.uid())`, not `auth.uid()`.** The wrapped form is hoisted into an initPlan and
evaluated once per statement instead of once per row.
