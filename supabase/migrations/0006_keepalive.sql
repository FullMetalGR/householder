-- The Vercel daily cron hits /api/keepalive, which calls this through
-- PostgREST with the anon key. A real round trip into Postgres is what
-- resets the Supabase Free 7 day inactivity pause. Deliberately anon:
-- it leaks nothing and writes nothing.
create or replace function public.keepalive()
returns timestamptz language sql stable set search_path = public as $$
  select now();
$$;

revoke execute on function public.keepalive() from public;
grant execute on function public.keepalive() to anon, authenticated;
