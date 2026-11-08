-- ===========================================================================
-- 0001_schema.sql — tables, revision trigger, indexes, grants.
--
-- Two decisions here shape everything else:
--
--   1. Ids are CLIENT-MINTED (uuid, no default on columns/cards). A retried
--      insert carries the same id, so a retry is an upsert rather than a
--      duplicate card. The queue can then retry freely without deduplicating.
--
--   2. Deletes are SOFT (archived_at). Postgres cannot apply RLS to a DELETE —
--      there is no row left to check access against — so delete events reach
--      every subscriber regardless of policy, and they carry only the primary
--      key. An archive is an ordinary UPDATE: policy-checked, and it ships the
--      whole row. The DELETE grant is revoked below to make that structural
--      rather than a convention someone can forget.
-- ===========================================================================

create extension if not exists pgcrypto;

create table public.boards (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 1 and 80),
  -- Share link = board id + token. Joining goes through public.join_board(),
  -- never a client INSERT on board_members.
  share_token uuid not null default gen_random_uuid(),
  created_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table public.board_members (
  board_id     uuid not null references public.boards (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'editor' check (role in ('owner','editor','viewer')),
  display_name text not null check (char_length(display_name) between 1 and 40),
  color        text not null check (color ~ '^#[0-9a-fA-F]{6}$'),
  joined_at    timestamptz not null default now(),
  primary key (board_id, user_id)
);

-- Only the LEADING column of a btree index counts as indexed, so the composite
-- primary key covers board_id and leaves user_id UNINDEXED. Every RLS check in
-- this schema looks members up BY USER, so without this index each one degrades
-- to a sequential scan on every row of every query.
create index board_members_user_id_idx on public.board_members (user_id);

create table public.columns (
  id               uuid primary key,          -- client-minted
  board_id         uuid not null references public.boards (id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 60),
  -- collate "C" is load-bearing, not cosmetic. Order keys are base-62, so they
  -- mix case: keyBetween(null, 'a0') emits 'Zz', which MUST sort before 'a0'.
  -- Byte order puts it there; a locale-aware collation (the cluster default on
  -- Supabase) sorts case-insensitively and puts 'Zz' last, inverting the board.
  -- Declaring it on the column makes byte order the default for every comparison
  -- and index on this column, so it matches the `<` operator in JS without each query
  -- having to remember an explicit COLLATE.
  order_key        text collate "C" not null check (char_length(order_key) between 2 and 64),
  archived_at      timestamptz,
  -- Monotonic per row, assigned by trigger. The client discards any change event
  -- whose rev is not greater than the one it holds, which makes replayed echoes
  -- and out-of-order delivery after a reconnect free of effect.
  rev              bigint not null default 1,
  -- Who wrote this, and which queued command it satisfies. The echo of my own
  -- write therefore acks itself; an ack counts only when origin_client_id equals
  -- my own client id, so another client cannot ack a command in my queue.
  origin_client_id text,
  origin_cmd_id    text,
  updated_at       timestamptz not null default now(),
  -- Lets cards carry a composite FK that pins column and board together.
  unique (id, board_id)
);
create index columns_board_order_idx on public.columns (board_id, order_key);

create table public.cards (
  id               uuid primary key,          -- client-minted
  -- Denormalised from columns deliberately: the realtime topic, the realtime
  -- filter and every RLS policy key off board_id, and none of them should have
  -- to join through columns to find it.
  board_id         uuid not null,
  column_id        uuid not null,
  title            text not null check (char_length(title) between 1 and 200),
  description      text not null default '',
  assignee_id      uuid references auth.users (id) on delete set null,
  priority         text not null default 'medium'
                     check (priority in ('urgent','high','medium','low')),
  due_date         date,
  -- FRACTIONAL INDEX (see src/lib/fracIndex.ts). A move writes this one row and
  -- touches no neighbour, so two people dragging different cards into the same
  -- gap mint two different keys and both survive. An integer position would
  -- collide on one value, or force a renumber of the whole column.
  -- text, not float: a double exhausts its mantissa after ~50 inserts into one
  -- gap and then silently returns a value equal to a neighbour.
  -- collate "C" is load-bearing, not cosmetic. Order keys are base-62, so they
  -- mix case: keyBetween(null, 'a0') emits 'Zz', which MUST sort before 'a0'.
  -- Byte order puts it there; a locale-aware collation (the cluster default on
  -- Supabase) sorts case-insensitively and puts 'Zz' last, inverting the board.
  -- Declaring it on the column makes byte order the default for every comparison
  -- and index on this column, so it matches the `<` operator in JS without each query
  -- having to remember an explicit COLLATE.
  order_key        text collate "C" not null check (char_length(order_key) between 2 and 64),
  archived_at      timestamptz,
  rev              bigint not null default 1,
  origin_client_id text,
  origin_cmd_id    text,
  created_by       uuid not null references auth.users (id) on delete cascade,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (board_id) references public.boards (id) on delete cascade,
  -- A card can never point at a column on another board — enforced by the
  -- database, not by hope. This is also what turns "move into a column someone
  -- archived concurrently" into a clean FK violation the adapter can map to a
  -- rejection, instead of a dangling row.
  foreign key (column_id, board_id)
    references public.columns (id, board_id) on delete cascade
);
create index cards_board_column_order_idx on public.cards (board_id, column_id, order_key);
create index cards_assignee_idx on public.cards (assignee_id);

-- --- rev: server-owned, never client-supplied ------------------------------
create or replace function public.bump_rev() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.rev := 1;                 -- a client cannot insert at rev 999 to pin a row
  else
    new.rev := old.rev + 1;
    new.updated_at := now();
  end if;
  return new;
end $$;

create trigger cards_bump_rev   before insert or update on public.cards
  for each row execute function public.bump_rev();
create trigger columns_bump_rev before insert or update on public.columns
  for each row execute function public.bump_rev();

-- --- Grants ----------------------------------------------------------------
-- RLS decides WHICH rows; grants decide whether the role may touch the table at
-- all. The revoke is the load-bearing line: there is no DELETE policy anywhere
-- in this schema, and this is what makes soft-delete structural.
grant select, insert, update on public.cards         to authenticated;
grant select, insert, update on public.columns       to authenticated;
grant select, update         on public.board_members to authenticated;
grant select                 on public.boards        to authenticated;

revoke delete on public.cards, public.columns, public.boards, public.board_members
  from anon, authenticated;
revoke all on public.boards, public.board_members, public.columns, public.cards from anon;
