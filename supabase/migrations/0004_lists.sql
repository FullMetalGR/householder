-- Plan 2: list lifecycle and suggestions. Unlike the 0002 bootstrap functions,
-- everything here runs SECURITY INVOKER (the default): the caller is already a
-- member, RLS must keep applying inside; these exist for atomicity and ranking.

create extension if not exists unaccent with schema extensions;

-- Case- and accent-insensitive normalization for suggestion dedup. unaccent
-- handles Greek diacritics on this Postgres version; the translate() pass is
-- belt and braces so dedup still works if the dictionary misses a form.
create or replace function private.norm_text(t text)
returns text
language sql stable
-- extensions stays in the path on purpose: unaccent's dictionary lookup
-- resolves through search_path even when the function call is qualified
set search_path = public, extensions
as $$
  select translate(
    lower(extensions.unaccent(coalesce(t, ''))),
    'άέήίόύώϊϋΐΰ',
    'αεηιουωιυιυ'
  );
$$;

-- Atomic completion with optional carry-over of unchecked items.
-- Raises: not_found, list_completed, empty_list.
create or replace function public.complete_list(p_list_id uuid, p_carry_over boolean)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  v_list public.lists%rowtype;
  v_total int;
  v_unchecked int;
  v_new_id uuid;
begin
  select * into v_list from public.lists where id = p_list_id;
  if not found then
    raise exception 'not_found';
  end if;
  if v_list.status <> 'active' then
    raise exception 'list_completed';
  end if;

  select count(*), count(*) filter (where not checked)
    into v_total, v_unchecked
    from public.list_items
   where list_id = p_list_id;
  if v_total = 0 then
    raise exception 'empty_list';
  end if;

  update public.lists
     set status = 'completed', completed_by = auth.uid(), completed_at = now()
   where id = p_list_id and status = 'active';
  if not found then
    raise exception 'list_completed';
  end if;

  if p_carry_over and v_unchecked > 0 then
    insert into public.lists (household_id, name, created_by)
    values (v_list.household_id, v_list.name, auth.uid())
    returning id into v_new_id;

    insert into public.list_items (list_id, household_id, name, qty, note, added_by, position)
    select v_new_id, v_list.household_id, name, qty, note, auth.uid(),
           row_number() over (order by position, created_at)
      from public.list_items
     where list_id = p_list_id and not checked;
  end if;

  return jsonb_build_object('completed_list_id', p_list_id, 'carry_list_id', v_new_id);
end;
$$;

-- Clone a completed trip into a fresh active list (the History "Again" action).
-- Copies every item with checked=false, positions renumbered 1..n.
-- Raises: not_found, not_completed.
create or replace function public.reorder_from(p_list_id uuid)
returns uuid
language plpgsql
volatile
set search_path = public
as $$
declare
  v_list public.lists%rowtype;
  v_new_id uuid;
begin
  select * into v_list from public.lists where id = p_list_id;
  if not found then
    raise exception 'not_found';
  end if;
  if v_list.status <> 'completed' then
    raise exception 'not_completed';
  end if;

  insert into public.lists (household_id, name, created_by)
  values (v_list.household_id, v_list.name, auth.uid())
  returning id into v_new_id;

  insert into public.list_items (list_id, household_id, name, qty, note, added_by, position)
  select v_new_id, v_list.household_id, name, qty, note, auth.uid(),
         row_number() over (order by position, created_at)
    from public.list_items
   where list_id = p_list_id;

  return v_new_id;
end;
$$;

-- Up to 10 distinct names from all of the household's lists, ranked by usage
-- count then recency, deduplicated via norm_text, displayed with the most
-- recent spelling, excluding names already on the target list. RLS scopes
-- every read: a non-member sees an empty result, never an error.
create or replace function public.suggest_items(p_list_id uuid, p_prefix text)
returns table (name text)
language sql
stable
set search_path = public
as $$
  with target as (
    select household_id from public.lists where id = p_list_id
  ),
  norm_prefix as (
    select private.norm_text(trim(coalesce(p_prefix, ''))) as np
  ),
  on_list as (
    select distinct private.norm_text(li.name) as norm
    from public.list_items li
    where li.list_id = p_list_id
  ),
  grouped as (
    select private.norm_text(li.name) as norm,
           count(*) as uses,
           max(li.created_at) as last_used,
           (array_agg(li.name order by li.created_at desc))[1] as display
    from public.list_items li
    join target t on li.household_id = t.household_id
    group by 1
  )
  select g.display as name
  from grouped g, norm_prefix p
  where g.norm not in (select norm from on_list)
    and (p.np = '' or g.norm like
         replace(replace(replace(p.np, '|', '||'), '%', '|%'), '_', '|_') || '%' escape '|')
  order by g.uses desc, g.last_used desc
  limit 10;
$$;

-- Grant pattern from 0002: nothing for anon/public, execute for authenticated.
-- norm_text lives in private; suggest_items runs as the caller, so the caller
-- needs execute on it too.
revoke execute on function private.norm_text(text) from public, anon;
revoke execute on function public.complete_list(uuid, boolean) from public, anon;
revoke execute on function public.reorder_from(uuid) from public, anon;
revoke execute on function public.suggest_items(uuid, text) from public, anon;
grant execute on function private.norm_text(text) to authenticated;
grant execute on function public.complete_list(uuid, boolean) to authenticated;
grant execute on function public.reorder_from(uuid) to authenticated;
grant execute on function public.suggest_items(uuid, text) to authenticated;

-- The 0002 RLS helpers never needed schema USAGE: policy expressions are stored
-- pre-parsed against function OIDs, so no name resolution happens at run time.
-- suggest_items is different: a LANGUAGE SQL invoker function resolves
-- private.norm_text by name under the calling role, which requires USAGE.
-- USAGE only permits lookup; every function in private stays gated by its own
-- EXECUTE acl. Caution for future migrations: a newly created function defaults
-- to EXECUTE for PUBLIC, so always pair "create function private.*" with the
-- revoke/grant pattern above, as 0002 and this file do.
grant usage on schema private to authenticated;

-- member_count (0002) ended up unused: leave_household counts inline and no
-- policy references it. Unlike the other helpers it does not self-filter by
-- auth.uid(), so with schema USAGE now granted it would let a direct database
-- connection probe member counts of arbitrary households. Remove it.
drop function private.member_count(uuid);
