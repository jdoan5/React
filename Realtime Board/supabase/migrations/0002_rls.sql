-- ===========================================================================
-- 0002_rls.sql — Row Level Security, and the boards <-> board_members
-- recursion trap that catches almost everyone who builds this schema.
--
-- THE TRAP: the natural policy on `boards` is "I am a member of this board",
-- which reads board_members. The natural policy on `board_members` is "I can
-- see members of boards I can see", which reads boards. Postgres then raises
--
--     42P17: infinite recursion detected in policy for relation "boards"
--
-- and EVERY read fails for EVERY affected role. It is not a slow query or a
-- wrong answer — the table becomes unreadable.
--
-- THE FIX: a SECURITY DEFINER function owned by postgres (which has BYPASSRLS).
-- Reading board_members inside it does not re-enter board_members' own policy,
-- so the cycle is broken. Both tables' policies call this helper, and NEITHER
-- reads the other.
-- ===========================================================================

-- NEVER in an exposed schema. A SECURITY DEFINER function in `public` is
-- callable over the Data API with its owner's privileges — which is a privilege
-- escalation, not a helper.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Returns the ROLE rather than a boolean, so one function serves every
-- owner/editor/viewer check across all four tables.
--
-- `set search_path = ''` is mandatory on any SECURITY DEFINER function: without
-- it, a caller can shadow a name and have their own code executed as the
-- function's owner.
create or replace function private.board_role(target uuid)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select m.role
  from public.board_members m
  where m.board_id = target
    and m.user_id = (select auth.uid())
$$;

revoke execute on function private.board_role(uuid) from public, anon;
grant  execute on function private.board_role(uuid) to authenticated;

-- An anonymous user is issued the `authenticated` Postgres role — the SAME role
-- as a signed-up user — so every `to authenticated` policy starts applying to
-- guests the instant the dashboard toggle flips. The is_anonymous JWT claim is
-- the only way to tell them apart.
--
-- NOTE: user_metadata (raw_user_meta_data) is writable by the user through
-- updateUser(), so it can NEVER appear in a policy. Only app_metadata and this
-- claim are trustworthy. In particular, options.data passed to
-- signInAnonymously() lands in user_metadata — unusable for authorization.
create or replace function private.is_guest() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
$$;
revoke execute on function private.is_guest() from public, anon;
grant  execute on function private.is_guest() to authenticated;

alter table public.boards        enable row level security;
alter table public.board_members enable row level security;
alter table public.columns       enable row level security;
alter table public.cards         enable row level security;

-- Conventions below, applied to every policy:
--   * one policy per operation, never `for all`
--   * always `to authenticated` — without the role, the expression is also
--     evaluated for anon traffic, which is pure overhead at best
--   * every auth call wrapped in (select ...) so Postgres hoists it into an
--     initPlan and evaluates it once per statement instead of once per row

-- --- boards ----------------------------------------------------------------
create policy "members read board" on public.boards
  for select to authenticated
  using ( (select private.board_role(id)) is not null );

-- Deliberately NO insert policy. Creating a board must also create the owner's
-- membership row in the same transaction, or the SELECT policy above hides the
-- board the user just made and `.insert().select()` returns zero rows. That is
-- public.create_board() in 0003.

create policy "owner updates board" on public.boards
  for update to authenticated
  using      ( (select private.board_role(id)) = 'owner' )
  with check ( (select private.board_role(id)) = 'owner' );

-- RESTRICTIVE, because policies are PERMISSIVE by default and OR together — a
-- permissive "not a guest" policy would WIDEN access, not narrow it. A
-- restrictive policy ANDs against the permissive set and grants nothing itself.
create policy "guests never rename boards" on public.boards
  as restrictive for update to authenticated
  using ( not (select private.is_guest()) );

-- --- board_members ---------------------------------------------------------
-- Reads the helper, not public.boards. That is the entire point.
create policy "members read roster" on public.board_members
  for select to authenticated
  using ( (select private.board_role(board_id)) is not null );

-- Rename or recolour yourself. The role check in WITH CHECK blocks escalation:
-- you may rewrite your row, but not promote yourself to owner.
create policy "self updates own member row" on public.board_members
  for update to authenticated
  using      ( user_id = (select auth.uid()) )
  with check ( user_id = (select auth.uid())
               and role = (select private.board_role(board_id)) );

-- No INSERT policy: joining is only possible through public.join_board(), which
-- validates the share token. No DELETE policy, and the grant is revoked.

-- --- columns ---------------------------------------------------------------
create policy "members read columns" on public.columns
  for select to authenticated
  using ( (select private.board_role(board_id)) is not null );

create policy "editors insert columns" on public.columns
  for insert to authenticated
  with check ( (select private.board_role(board_id)) in ('owner','editor') );

create policy "editors update columns" on public.columns
  for update to authenticated
  using      ( (select private.board_role(board_id)) in ('owner','editor') )
  with check ( (select private.board_role(board_id)) in ('owner','editor') );

-- --- cards -----------------------------------------------------------------
create policy "members read cards" on public.cards
  for select to authenticated
  using ( (select private.board_role(board_id)) is not null );

create policy "editors insert cards" on public.cards
  for insert to authenticated
  with check (
    (select private.board_role(board_id)) in ('owner','editor')
    and created_by = (select auth.uid())
  );

-- CAREFUL: for an UPDATE to be DELIVERED over Realtime, the policy must admit
-- BOTH the old and the new row state. Both clauses are therefore
-- membership-only. Adding `and archived_at is null` here would silently swallow
-- the very event that archives a card — the classic version of this bug, and it
-- fails as "the card stays on everyone else's screen forever".
create policy "editors update cards" on public.cards
  for update to authenticated
  using      ( (select private.board_role(board_id)) in ('owner','editor') )
  with check ( (select private.board_role(board_id)) in ('owner','editor') );

-- No DELETE policy on cards or columns at all. Archiving is an UPDATE.
