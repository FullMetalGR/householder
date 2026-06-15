-- Local-only configuration applied by `supabase db reset`. Production inserts
-- the same two secrets once via the SQL editor (docs/RUNBOOK.md).
-- host.docker.internal: pg_cron runs inside the db container; the locally
-- served Edge Function listens on the host at 54321.
-- Guarded: vault.create_secret raises on duplicate names, and this file
-- should stay harmless if someone applies it to an already-seeded database.
select vault.create_secret('http://host.docker.internal:54321/functions/v1/push', 'push_function_url')
  where not exists (select 1 from vault.secrets where name = 'push_function_url');
select vault.create_secret('local-dev-push-secret', 'push_function_secret')
  where not exists (select 1 from vault.secrets where name = 'push_function_secret');
