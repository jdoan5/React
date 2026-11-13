-- ===========================================================================
-- 0005_front_door.sql — what the app's front door needs from the database.
--
-- Two functions from 0003, replaced with the same signatures, so
-- `create or replace` swaps each body in place and every grant survives.
-- The grants are restated anyway, so this file reads correctly on its own and
-- re-running it is harmless.
--
--   create_board  now also creates the four default columns, in the SAME
--                 transaction, so a board can never exist half-made — 0003's
--                 version made boards with no columns, which rendered as an
--                 empty page with nowhere to put a card.
--
--   join_board    now race-free. 0003 checked for an existing membership and
--                 THEN inserted; two concurrent joins by the same visitor (one
--                 link opened in two tabs, or React StrictMode connecting
--                 twice) both passed the check, and the second died on the
--                 primary key with 23505.
-- ===========================================================================

create or replace function public.create_board(
  p_title text, p_name text, p_color text
) returns public.boards
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_board public.boards;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'invalid colour' using errcode = '22023';
  end if;

  insert into public.boards (title, created_by)
  values (left(coalesce(nullif(trim(p_title), ''), 'Untitled board'), 80), v_uid)
  returning * into v_board;

  insert into public.board_members (board_id, user_id, role, display_name, color)
  values (v_board.id, v_uid, 'owner',
          left(coalesce(nullif(trim(p_name), ''), 'Guest'), 40), p_color);

  -- The same titles and order keys the demo board seeds (src/data/seed.ts:
  -- COLUMN_TITLES with keysBetween(null, null, 4)), so both modes start
  -- identical. defaultColumns.test.ts parses these four rows and fails if
  -- either side drifts.
  --
  -- Ids are minted here rather than client-side: 0001's client-minted rule
  -- exists so a RETRIED insert becomes an upsert, and nothing retries this one.
  -- rev starts at 1 via the bump_rev trigger; origin_* stay null, which the
  -- client reads as a server write rather than an echo of its own command.
  insert into public.columns (id, board_id, title, order_key) values
    (gen_random_uuid(), v_board.id, 'Backlog',     'a0'),
    (gen_random_uuid(), v_board.id, 'In progress', 'a1'),
    (gen_random_uuid(), v_board.id, 'In review',   'a2'),
    (gen_random_uuid(), v_board.id, 'Done',        'a3');

  return v_board;
end $$;

revoke execute on function public.create_board(text, text, text) from public, anon;
grant  execute on function public.create_board(text, text, text) to authenticated;


create or replace function public.join_board(
  p_board_id uuid, p_token uuid, p_name text, p_color text
) returns public.board_members
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid    uuid := (select auth.uid());
  v_member public.board_members;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'invalid colour' using errcode = '22023';
  end if;
  -- One error for "wrong token" and "no such board": telling them apart would
  -- let a link be probed for which boards exist.
  if not exists (
    select 1 from public.boards b
    where b.id = p_board_id and b.share_token = p_token
  ) then
    raise exception 'invalid share link' using errcode = '42501';
  end if;

  -- ON CONFLICT rather than "select, then insert": the insert itself is the
  -- check, so a concurrent join waits on the primary key and then does
  -- nothing, instead of failing. `do nothing` also means re-joining can never
  -- downgrade an existing owner to editor.
  insert into public.board_members (board_id, user_id, role, display_name, color)
  values (p_board_id, v_uid, 'editor',
          left(coalesce(nullif(trim(p_name), ''), 'Guest'), 40), p_color)
  on conflict (board_id, user_id) do nothing
  returning * into v_member;

  if not found then
    select * into v_member from public.board_members
     where board_id = p_board_id and user_id = v_uid;
  end if;
  return v_member;
end $$;

revoke execute on function public.join_board(uuid, uuid, text, text) from public, anon;
grant  execute on function public.join_board(uuid, uuid, text, text) to authenticated;
