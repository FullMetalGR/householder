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
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`.
6. **Keep-alive** (Plan 3 adds the route + vercel.json cron): prevents the 7-day free pause.

## Known free-tier constraints

- Supabase Free pauses after 7 idle days; restore is manual in the dashboard.
- No automatic DB backups on Free (Plan 3 adds a monthly pg_dump GitHub Action).
- Built-in auth mailer delivers only to team addresses, ~2/hour: Resend is mandatory.

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
