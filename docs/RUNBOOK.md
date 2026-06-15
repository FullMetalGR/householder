# Householder Production Runbook

## One-time setup (free everywhere)

1. **Supabase project**: create at supabase.com (Free plan). Note URL and anon key.
   Apply migrations: `npx supabase link --project-ref <ref> && npx supabase db push`.
2. **Google OAuth**: Google Cloud Console, create OAuth client (Web).
   Authorized redirect URI: `https://<ref>.supabase.co/auth/v1/callback`.
   Paste client id/secret in Supabase Dashboard, Auth, Providers, Google.
3. **Resend SMTP** (magic links): create a free Resend account (3,000 emails/month).
   Supabase Dashboard, Auth, SMTP settings: host `smtp.resend.com`, user `resend`,
   password = Resend API key. The Supabase built-in mailer is dev-only.
4. **Auth URLs**: Supabase Dashboard, Auth, URL configuration:
   site URL `https://<app>.vercel.app`, redirect `https://<app>.vercel.app/auth/callback`.
5. **Vercel**: import the GitHub repo (Hobby plan). Env vars:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`,
   and `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (see Push notifications below).
6. **Keep-alive**: `vercel.json` ships a daily cron hitting `/api/keepalive`,
   which performs a real anonymous query; nothing to configure beyond deploying.

## Known free-tier constraints

- Supabase Free pauses after 7 idle days; restore is manual in the dashboard.
- No automatic DB backups on Free (Plan 3 adds a monthly pg_dump GitHub Action).
- Built-in auth mailer delivers only to team addresses, ~2/hour: Resend is mandatory.

## Push notifications (one-time per environment)

1. Generate keys: `node scripts/generate-vapid-keys.mjs`. Keep both outputs.
2. Edge Function secrets (Dashboard, Edge Functions, push, Secrets, or
   `npx supabase secrets set`):
   - `VAPID_KEYS_JSON`: the single-line JSON from step 1
   - `VAPID_CONTACT_EMAIL`: a reachable mailbox (push services require it)
   - `PUSH_FUNCTION_SECRET`: a long random string (`openssl rand -hex 32`)
   - `APP_URL`: `https://<app>.vercel.app`
3. Deploy the function: `npx supabase functions deploy push`
   (`verify_jwt = false` ships in `supabase/config.toml`; the shared secret
   header is the gate).
4. Vault secrets so pg_cron can call the function (SQL editor, once):

   select vault.create_secret('https://<ref>.supabase.co/functions/v1/push', 'push_function_url');
   select vault.create_secret('<same value as PUSH_FUNCTION_SECRET>', 'push_function_secret');

   The cron jobs themselves were created by migration 0005 during `db push`.
5. Vercel env: add `NEXT_PUBLIC_VAPID_PUBLIC_KEY` from step 1.
6. Verification: install the PWA on two phones, enable notifications on both
   (Settings switch), close the app on one, add an item from the other, and
   expect one digest notification within about a minute.

## Backups

`.github/workflows/backup.yml` dumps schema and data monthly into a 90 day
artifact. It needs one repository secret: `SUPABASE_DB_URL` (Dashboard,
Database, Connection string, URI; the session pooler form works). Until the
secret exists the workflow skips itself and stays green. Run it once manually
(Actions, Backup, Run workflow) after configuring to confirm.

## Deploy order (first production deploy)

1. Supabase: create project, `npx supabase link --project-ref <ref>`,
   `npx supabase db push` (applies 0001..0006 including cron jobs).
2. Auth: Google OAuth, Resend SMTP, site URL and redirect URLs (sections above).
3. Push: the section above (secrets, function deploy, Vault inserts).
4. Vercel: import repo, set the four `NEXT_PUBLIC_*` env vars, deploy.
5. GitHub: add `SUPABASE_DB_URL` secret, run the Backup workflow once.
6. Phones: open the Vercel URL, install (Android: install prompt; iPhone:
   Share, Add to Home Screen), sign in, enable notifications.

## Play Store later (TWA)

- `public/.well-known/assetlinks.json` with the SHA-256 of the Play App Signing key
  (Play Console, App integrity), NOT the local upload key.
- Internal testing track is enough for family phones (no 12-tester requirement).
- One-time 25 USD fee. Target API level: follow Play's current floor.

## Continuous integration

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push to main
and every pull request: it boots the Supabase local stack, then runs typecheck, lint,
and the full test suite (RLS isolation, routers, helpers).

### Known flake: WSL2 clock skew

When running the suite locally under WSL2, the Supabase Auth container's clock can drift
ahead of the host, producing a transient "JWT issued at future time" failure in the
router tests. It passes on re-run. GitHub Actions runners do not exhibit this (host and
container share an accurate clock). If it bites locally, run `npm test` again or resync
the WSL clock with `sudo hwclock -s`.

### Known issue: type generation requires an access token

Supabase CLI 2.106 fails `gen types typescript --local` (and `--db-url`) with
LegacyPlatformAuthRequiredError unless a platform access token is configured,
even though generation is a purely local operation. Until the CLI fixes this or
a token is configured, new database functions and tables are added to
`lib/supabase/database.types.ts` by hand, mirroring the generator's exact output
format (jsonb maps to Json, uuid to string, returns table to a row array).
After configuring a token, regenerate the file and diff it against the manual
entries before committing.
