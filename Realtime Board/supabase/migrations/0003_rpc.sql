-- ===========================================================================
-- 0003_rpc.sql — the two writes RLS cannot express on its own.
--
--   create_board: the board row and the owner's membership row have to land in
--                 ONE transaction. Insert the board alone and the SELECT policy
--                 ("am I a member?") immediately hides it, so `.insert()
--                 .select()` returns zero rows for the row you just created.
--
--   join_board:   the share token must be checked server-side. A client-side
--                 check is not a check.
--
-- Both are SECURITY DEFINER and live in `public` only because they must be
-- callable over RPC. Neither takes an authorization decision from its caller,
-- and each writes only the caller's own rows.
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
  v_uid      uuid := (select auth.uid());
  v_existing public.board_members;
  v_inserted public.board_members;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_color !~ '^#[0-9a-fA-F]{6}$' then
    raise exception 'invalid colour' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.boards b
    where b.id = p_board_id and b.share_token = p_token
  ) then
    raise exception 'invalid share link' using errcode = '42501';
  end if;

  select * into v_existing from public.board_members
   where board_id = p_board_id and user_id = v_uid;
  if found then
    return v_existing;   -- idempotent: re-joining is a no-op, not an error
  end if;

  insert into public.board_members (board_id, user_id, role, display_name, color)
  values (p_board_id, v_uid, 'editor',
          left(coalesce(nullif(trim(p_name), ''), 'Guest'), 40), p_color)
  returning * into v_inserted;
  return v_inserted;
end $$;

revoke execute on function public.join_board(uuid, uuid, text, text) from public, anon;
grant  execute on function public.join_board(uuid, uuid, text, text) to authenticated;
