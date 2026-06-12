-- SECURITY DEFINER helpers in a private schema. Policies must never query
-- household_members directly: a self-referential policy recurses (42P17).

create schema if not exists private;

create or replace function private.is_member(hid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from household_members
    where household_id = hid and user_id = auth.uid()
  );
$$;

create or replace function private.is_owner(hid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from household_members
    where household_id = hid and user_id = auth.uid() and role = 'owner'
  );
$$;

create or replace function private.shares_household(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from household_members a
    join household_members b on a.household_id = b.household_id
    where a.user_id = auth.uid() and b.user_id = uid
  );
$$;

create or replace function private.member_count(hid uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from household_members where household_id = hid;
$$;

revoke all on schema private from anon, authenticated;

-- Structural columns are immutable: WITH CHECK cannot compare against OLD,
-- so without this a user in two households could relocate lists or items.
-- One function per table: NEW resolves against the firing table's row type.
create or replace function private.lists_immutable_cols()
returns trigger language plpgsql as $$
begin
  if new.household_id <> old.household_id then
    raise exception 'household_id_immutable';
  end if;
  return new;
end;
$$;

create or replace function private.items_immutable_cols()
returns trigger language plpgsql as $$
begin
  if new.household_id <> old.household_id or new.list_id <> old.list_id then
    raise exception 'structural_columns_immutable';
  end if;
  return new;
end;
$$;

create trigger lists_immutable before update on public.lists
  for each row execute function private.lists_immutable_cols();
create trigger items_immutable before update on public.list_items
  for each row execute function private.items_immutable_cols();

-- profiles
create policy "profiles_select" on public.profiles for select
  using (id = auth.uid() or private.shares_household(id));
create policy "profiles_update" on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- households: insert only via create_household()
create policy "households_select" on public.households for select using (private.is_member(id));
create policy "households_update" on public.households for update
  using (private.is_member(id)) with check (private.is_member(id));
create policy "households_delete" on public.households for delete using (private.is_member(id));

-- household_members: insert only via create_household() / redeem_invite()
create policy "members_select" on public.household_members for select
  using (private.is_member(household_id));
create policy "members_delete_self" on public.household_members for delete
  using (user_id = auth.uid() and role <> 'owner');
create policy "members_delete_by_owner" on public.household_members for delete
  using (private.is_owner(household_id) and user_id <> auth.uid());

-- invites: redemption via redeem_invite()
create policy "invites_select" on public.invites for select using (private.is_member(household_id));
create policy "invites_insert" on public.invites for insert
  with check (private.is_member(household_id) and created_by = auth.uid());
create policy "invites_delete" on public.invites for delete using (private.is_member(household_id));

-- lists and list_items
create policy "lists_all" on public.lists for all
  using (private.is_member(household_id)) with check (private.is_member(household_id));
create policy "items_all" on public.list_items for all
  using (private.is_member(household_id)) with check (private.is_member(household_id));

-- push_subscriptions
create policy "push_all" on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- notification_queue: zero policies, no client access.

-- Atomic household creation (resolves the membership chicken-and-egg).
create or replace function public.create_household(p_name text)
returns public.households language plpgsql security definer set search_path = public as $$
declare h public.households;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if length(trim(p_name)) = 0 or length(p_name) > 80 then
    raise exception 'invalid_name';
  end if;
  insert into households (name, created_by) values (trim(p_name), auth.uid()) returning * into h;
  insert into household_members (household_id, user_id, role) values (h.id, auth.uid(), 'owner');
  return h;
end;
$$;

-- Invite redemption by a non-member. Normalizes the code (spec section 5).
create or replace function public.redeem_invite(p_code text)
returns public.households language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  inv public.invites;
  h public.households;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  v_code := upper(regexp_replace(coalesce(p_code, ''), '[\s-]', '', 'g'));
  -- Look up code ignoring used_at so we can short-circuit for already-members.
  select * into inv from invites where code = v_code;
  if not found then
    raise exception 'invalid_or_expired_code';
  end if;
  select * into h from households where id = inv.household_id;
  -- already a member: no-op regardless of whether the code is still valid
  if exists (select 1 from household_members where household_id = inv.household_id and user_id = auth.uid()) then
    return h;
  end if;
  -- now apply full validity check for a non-member
  if inv.used_at is not null or inv.expires_at <= now() then
    raise exception 'invalid_or_expired_code';
  end if;
  -- consume first, guarded: exactly one concurrent redeemer can win
  update invites set used_by = auth.uid(), used_at = now()
    where id = inv.id and used_at is null;
  if not found then
    raise exception 'invalid_or_expired_code';
  end if;
  insert into household_members (household_id, user_id, role) values (inv.household_id, auth.uid(), 'member');
  return h;
end;
$$;

-- Atomic leave. The only path for an owner to exit: when they are the last
-- member the whole household is deleted (FK cascade), so no orphan can exist.
create or replace function public.leave_household(p_household_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select role into v_role from household_members
    where household_id = p_household_id and user_id = auth.uid()
    for update;
  if not found then
    raise exception 'not_a_member';
  end if;
  select count(*) into v_count from household_members where household_id = p_household_id;
  if v_count = 1 then
    delete from households where id = p_household_id;
    return;
  end if;
  if v_role = 'owner' then
    raise exception 'owner_must_remove_members_first';
  end if;
  delete from household_members
    where household_id = p_household_id and user_id = auth.uid();
end;
$$;

revoke execute on function public.create_household(text) from anon, public;
revoke execute on function public.redeem_invite(text) from anon, public;
revoke execute on function public.leave_household(uuid) from anon, public;
grant execute on function public.create_household(text) to authenticated;
grant execute on function public.redeem_invite(text) to authenticated;
grant execute on function public.leave_household(uuid) to authenticated;

-- Profile auto-creation on signup. Google supplies full_name/avatar_url metadata;
-- magic-link signups fall back to the email local part (spec section 7).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name, avatar_url)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)), 60),
    case
      when new.raw_user_meta_data ->> 'avatar_url' ~* '^https?://' then new.raw_user_meta_data ->> 'avatar_url'
      else null
    end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles
  add constraint profiles_display_name_length check (char_length(display_name) between 1 and 60);

-- Explicit table grants: current Supabase defaults grant client roles no DML
-- on new tables. RLS (above) still gates every row; these grants only open the
-- statement types each role legitimately uses. anon gets nothing. INSERTs into
-- households and household_members happen only via the SECURITY DEFINER
-- functions, so those roles get no INSERT there.

grant select, update on public.profiles to authenticated;
grant select, update, delete on public.households to authenticated;
grant select, delete on public.household_members to authenticated;
grant select, insert, delete on public.invites to authenticated;
grant select, insert, update, delete on public.lists to authenticated;
grant select, insert, update, delete on public.list_items to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- The push Edge Function (plan 3) runs with service_role.
grant all on all tables in schema public to service_role;

-- Belt and braces hardening, plus the template's leftover DDL-ish privileges.
-- Helpers must stay executable by authenticated: RLS policies invoke them as
-- the calling role (EXECUTE is checked before SECURITY DEFINER applies).
-- anon and public are locked out at both the schema and function layer.
revoke execute on all functions in schema private from public, anon;
grant execute on function
  private.is_member(uuid),
  private.is_owner(uuid),
  private.shares_household(uuid),
  private.member_count(uuid)
to authenticated;
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
