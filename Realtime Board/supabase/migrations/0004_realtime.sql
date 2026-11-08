-- ===========================================================================
-- 0004_realtime.sql — publication, and Realtime Authorization.
--
-- Two separate things have to be true for a client to receive a row change:
--
--   1. The table is in the `supabase_realtime` publication, and the subscribing
--      role can SELECT the row (0001 and 0002 handle the grant and the policy).
--   2. The client is allowed onto the channel at all. Channels opened with
--      `private: true` are governed by RLS on `realtime.messages` — that is
--      what Realtime Authorization means, and without a policy there, every
--      private channel is simply denied.
-- ===========================================================================

-- --- 1. Publication --------------------------------------------------------
-- Per table, deliberately: a schema-wide publication would start shipping any
-- future table to subscribers the moment it is created.
alter publication supabase_realtime add table public.cards;
alter publication supabase_realtime add table public.columns;
alter publication supabase_realtime add table public.board_members;

-- Verify with:
--   select * from pg_publication_tables where pubname = 'supabase_realtime';

-- NOTE: `replica identity full` is deliberately NOT set.
--
-- It is the usual advice for "I want the old row", but with RLS enabled it does
-- not work: `old` still arrives holding only the primary key, and there is no
-- workaround. Setting it would cost extra WAL volume on every update and buy
-- nothing. The client diffs against its own snapshot instead, and ChangeEvent
-- types `old_record` as `{ id }` so reading anything else is a compile error.

-- --- 2. Realtime Authorization --------------------------------------------
-- The channel topic is `board:<uuid>`, so membership is decided by parsing the
-- board id out of the topic and reusing the same helper every table policy uses.
-- No new trust path, and no second definition of "is a member" to drift.

create or replace function private.topic_board_id(topic text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  -- Returns null for a malformed topic, which fails the policies below closed.
  select nullif(substring(topic from '^board:([0-9a-fA-F-]{36})$'), '')::uuid
$$;
revoke execute on function private.topic_board_id(text) from public, anon;
grant  execute on function private.topic_board_id(text) to authenticated;

-- Listening: any member of the board.
create policy "members listen on their board channel"
  on realtime.messages
  for select
  to authenticated
  using (
    (select private.board_role((select private.topic_board_id(realtime.topic())))) is not null
  );

-- Broadcasting (cursors): editors and owners only, so a viewer cannot inject
-- traffic onto a board they can merely read.
create policy "editors broadcast on their board channel"
  on realtime.messages
  for insert
  to authenticated
  with check (
    (select private.board_role((select private.topic_board_id(realtime.topic()))))
      in ('owner','editor')
  );

-- Realtime caches a connection's authorization decision, so a revoked
-- membership keeps working until the client reconnects or its JWT is refreshed.
-- Shorten the JWT expiry window if that matters for your threat model; it is a
-- dashboard setting, not something a migration can express.
