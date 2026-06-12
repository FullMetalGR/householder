# Householder: Design Specification

Date: 2026-06-11

## 1. Overview

Householder is a mobile-first Progressive Web App for families who share supermarket needs. Members of a household share shopping lists: anyone can add items, everyone sees changes live, and whoever is at the store checks items off. A finished trip is archived and can be repeated with one tap. The app is free to build, free to run, and installable on any phone today, with a path to the Google Play Store later.

### Goals

- Two (or more) people share shopping lists with zero friction: adding an item takes under two seconds from opening the app.
- Live collaboration: changes appear on other phones in under a second while the app is open, and as batched push notifications otherwise.
- Total running cost of zero euros per month on free tiers.
- A design ready to plug in supermarket ordering (Sklavenitis first) without reworking the UI or API.

### Non-goals for v1

- Creating mutations while offline (offline read works; a mutation queue is a v2 candidate).
- Manual item reordering (drag to reorder is a v2 candidate; v1 order is insertion order).
- Ownership transfer for households (v2 candidate).
- Price tracking, recipes, barcode scanning, pantry inventory.
- Actual supermarket API integration (only the interface boundary ships in v1).
- Public app store listing (PWA install now; TWA wrap for Play later).

## 2. Core concepts

- **Profile**: one per signed-in user. Display name plus avatar (Google photo by default, replaceable by upload, initials as fallback).
- **Household**: a named group (for example "Σπίτι μας"). A user can belong to several households. Exactly one owner per household; everyone else is a member.
- **Invite**: a single-use code with a share link, valid 7 days, redeemable while signed in. Shared through the phone's native share sheet (any app) or read out loud.
- **List**: a named shopping list inside a household, with status `active` or `completed`. A completed list is the record of a shopping trip; History is simply the set of completed lists.
- **Item**: a line on a list: required name, optional free-text quantity and note, who added it, checked state with who checked it and when, and a sort position (insertion order in v1).

## 3. Platform and stack

PWA chosen over native: installable today from a URL on both Android and iPhone with no store accounts, free hosting, and a supported path to Google Play later via Trusted Web Activity. All versions verified current as of 2026-06-11.

| Layer | Choice |
|---|---|
| Framework | Next.js 16.2.x (App Router, React 19.2), TypeScript >= 5.7.2, strict mode |
| Internal API | tRPC 11.17.x with the @trpc/tanstack-react-query integration (React Compiler safe), fetch adapter route handler at `app/api/trpc/[trpc]/route.ts` |
| Data fetching | TanStack React Query 5.x (>= 5.80.3), persisted cache for offline reads |
| Validation | Zod on every tRPC input |
| Backend | Supabase Free: Auth, Postgres 15+ with RLS, Realtime, Edge Functions, pg_cron, pg_net, Vault |
| Styling | Tailwind CSS 4.3, shadcn/ui (new-york style, OKLCH tokens), lucide-react icons, sonner toasts |
| Theming | next-themes 0.4.6, class strategy, `@custom-variant dark` in globals.css, default `system` |
| i18n | next-intl 4.13 in the documented no-i18n-routing mode: locale from a cookie, no URL prefixes. Greek default, English toggle. The toggle sets the cookie and calls `profile.update({ locale })` in the same action; after sign-in on a device without the cookie, the cookie is initialized from `profiles.locale` |
| PWA | `app/manifest.ts` (Next built-in) plus Serwist 9.5.x via @serwist/turbopack (Next 16 builds with Turbopack; the webpack plugin would silently not run) |
| Hosting | Vercel Hobby (free), deploy on push to main, preview deploys per PR |
| Email | Resend free tier (3,000 emails per month) as custom SMTP for Supabase Auth magic links. The Supabase built-in mailer is dev-only (about 2 emails per hour, team addresses only) and must not be relied on |

Rationale for the API layer living in Next.js route handlers rather than Supabase Edge Functions: end-to-end TypeScript types from database to UI in one repo, with Supabase RLS as an independent second enforcement layer underneath.

## 4. Architecture

One repository, one Next.js app, one Supabase project.

- The client calls tRPC procedures for every mutation and query. The browser uses `@supabase/ssr` `createBrowserClient` so the session is cookie-stored; the tRPC fetch-adapter context builds a `createServerClient` from the request cookies and calls `auth.getUser()` to verify the JWT, then exposes a user-scoped Supabase client, so Postgres RLS applies to every statement the API makes. No service-role usage in request paths (the push Edge Function and SECURITY DEFINER database functions are the controlled exceptions, server-side only).
- The client additionally holds one Realtime subscription scoped to the active household for live updates (section 9).
- Auth flows (Google OAuth, magic link) go directly between the client and Supabase Auth; the API never sees credentials.
- Future supermarket ordering is a module behind the API (section 11), so external integrations never touch the client.

Data flow for the canonical action "partner adds cheese":

1. Partner types the name and presses enter. The UI applies the change optimistically.
2. `item.add` tRPC mutation inserts the row (RLS checks membership).
3. A Postgres trigger enqueues a notification event and Realtime broadcasts the change.
4. Your open app receives the Realtime event and updates in under a second.
5. Within a minute, pg_cron flushes the queue and the Edge Function sends one batched web push ("Η Μαρία πρόσθεσε 3 προϊόντα στο Σούπερ μάρκετ"). Note: this describes the user experience; the pipeline does not check whether the app is open (section 9).

## 5. Data model

Eight tables, all in the `public` schema, all with RLS enabled. `auth.users` is Supabase-managed.

| Table | Columns (key ones) | Notes |
|---|---|---|
| `profiles` | `id` (PK, = auth.users.id), `display_name`, `avatar_url`, `locale` ('el' default), `created_at` | Row created by trigger on signup. `locale` mirrors the last UI choice and localizes push text per recipient |
| `households` | `id`, `name`, `created_by`, `created_at` | |
| `household_members` | `household_id` + `user_id` (composite PK), `role` ('owner' or 'member'), `joined_at` | |
| `invites` | `id`, `household_id`, `code` (unique), `created_by`, `expires_at` (now + 7 days), `used_by`, `used_at` | Single use. `code`: 8 chars from `ABCDEFGHJKMNPQRSTVWXYZ23456789` (no I, L, O, 0, 1), stored uppercase. Redemption normalizes input (trim, strip spaces and dashes, uppercase) before lookup so codes survive being read out loud or typed lowercase |
| `lists` | `id`, `household_id`, `name`, `status` ('active' or 'completed'), `created_by`, `created_at`, `completed_by`, `completed_at` | History = completed lists; no separate table. Duplicate list names within a household are allowed |
| `list_items` | `id`, `list_id`, `household_id` (denormalized from the parent list, set on insert; enables the household-scoped Realtime filter), `name`, `qty` (text, nullable), `note` (nullable), `added_by`, `checked` (bool), `checked_by`, `checked_at`, `position` (numeric), `created_at` | `qty` stays free text in v1. `position` is insertion order in v1 (numeric so future drag-reorder can use fractional midpoints) |
| `push_subscriptions` | `id`, `user_id`, `endpoint` (unique), `p256dh`, `auth`, `user_agent`, `created_at` | One row per device. Pruned on 404/410 from the push service |
| `notification_queue` | `id`, `household_id`, `list_id`, `actor_id`, `event` ('items_added', 'list_completed'), `payload` jsonb, `created_at`, `processed_at` | No client access at all. Written by triggers, read and marked processed by the Edge Function. The enqueue trigger function is SECURITY DEFINER (owned by postgres, search_path pinned) so it can write despite the table having no policies |

### RLS policies

Policies never query `household_members` directly: a self-referential policy recurses (Postgres error 42P17, the classic membership-table trap). Instead, three SECURITY DEFINER helper functions live in a private, non-exposed schema, all STABLE with pinned search_path: `private.is_member(hid uuid)`, `private.is_owner(hid uuid)`, and `private.shares_household(uid uuid)`. All policies are expressed through these helpers.

- `profiles`: read where `private.shares_household(id)` or own row; update own row only.
- `households`: select/update/delete require `private.is_member(id)`. INSERT has no client-facing policy: creation goes only through the `create_household` function (below).
- `household_members`: members read the member list via `private.is_member`; owners delete other members' rows via `private.is_owner`; users delete their own row (leave), except a sole owner with other members remaining (enforced in the API and by a guard in the policy). INSERT has no client-facing policy: membership rows are written only by `create_household` and the invite-redemption function.
- `lists`, `list_items`: all operations require `private.is_member(household_id)`.
- `invites`: members create and read; redemption goes through a SECURITY DEFINER function `redeem_invite(code text)` so non-members can join.
- `push_subscriptions`: owner-only, all operations.
- `notification_queue`: no policies (no client access).

Bootstrap: `household.create` calls a single SECURITY DEFINER function `create_household(name text)` that atomically inserts the households row (`created_by = auth.uid()`) and the creator's owner membership row, returning the new household. This resolves the chicken-and-egg between the households INSERT and the membership it would require.

Grants: current Supabase defaults give client roles no DML privileges on new tables, so the security migration grants each statement type explicitly per table to `authenticated` (nothing to `anon`; `service_role` gets full access for the push Edge Function). RLS remains the row-level gate on top of these statement-level grants. Verified against the live REST path during implementation (2026-06-12).

Departed members: `added_by`, `checked_by`, `completed_by`, and `created_by` keep referencing a departed user's id (FKs are not nulled). Their profile may be unreadable under the profiles policy; the UI renders a neutral fallback avatar and omits the name in that case, never treating it as an error.

### Storage

One public-read `avatars` bucket. `storage.objects` carries INSERT and UPDATE policies for this bucket scoped to paths whose first folder equals `auth.uid()::text`, because the signed upload URL is issued by the user-scoped client and storage RLS applies at issuance. Clients resize images to 256 px before upload. After a successful upload the client persists the public URL via `profile.update({ avatarUrl })`; the server validates the URL points into the caller's own folder.

## 6. Internal API (tRPC routers)

- `household`: `create` (via `create_household`), `rename`, `listMine`, `members.list`, `members.remove` (owner only), `leave`.
- `invite`: `create` (returns code and share link), `list` (pending unexpired invites of the household, with code and expiry), `redeem(code)`, `revoke(inviteId)`.
- `list`: `create`, `rename`, `delete`, `getActive`, `getHistory` (cursor-paginated, page size 20), `complete({ listId, carryOver: boolean })`, `reorderFrom(completedListId)`.
- `item`: `add({ listId, name, qty?, note? })`, `update({ itemId, name?, qty?, note? })`, `setChecked({ itemId, checked })`, `remove`, `suggest({ listId, prefix })`.
- `profile`: `get`, `update({ displayName?, locale?, avatarUrl? })`, `getAvatarUploadUrl`.
- `push`: `subscribe(subscription)`, `unsubscribe(endpoint)`.
- `supermarket` (v1 ships the types and stub only): `providers.list`, `createOrder(listId)`.

### Semantics worth pinning

**Lists and completion**

- `list.complete` on a list with unchecked items: when `carryOver` is true, unchecked items are copied into a new active list with the same name; the original archives fully. With zero unchecked items the server ignores `carryOver` and never creates a new list. A list with zero items cannot be completed: the button is disabled and the server returns a typed BAD_REQUEST; an empty list can only be renamed or deleted.
- Completed lists are immutable except for `list.delete` and serving as the source of `reorderFrom`. `item.add`/`update`/`setChecked`/`remove`, `list.rename`, and `list.complete` against a completed list fail with a typed BAD_REQUEST; the client surfaces a toast and refetches.
- Both copy operations (carry-over and `reorderFrom`) copy name, qty, and note; `checked` is false and `checked_by`/`checked_at` are null; `added_by` is the user who triggered the operation; `created_at` is now; positions are renumbered 1..n preserving source order. The new list takes the source list's exact name.
- `getActive` orders by `created_at` descending; `getHistory` orders by `completed_at` descending.

**Items**

- Display order in List detail: unchecked items first, then checked items, each group sorted by `position` ascending (ties by `created_at`). Checking never changes `position`; it only moves the row between groups. `item.add` assigns `position` = max on the list + 1. No reorder mutation exists in v1.
- `item.setChecked` takes the explicit target state so concurrent taps converge (last write wins) instead of toggling past each other. Checking records `checked_by` and `checked_at`; unchecking clears both.
- `item.add` never dedupes: adding a name that already exists on the list creates a second row. No quantity merging in v1.
- `item.suggest({ listId, prefix })`: up to 10 distinct item names from all lists of the household, active and completed. Names are deduplicated case- and accent-insensitively (lower + unaccent) and displayed with the most recently used spelling. Prefix match on the normalized name; an empty prefix returns the overall top 10 (powers the chips shown before typing). Ranked by total occurrence count, ties by most recent `created_at`. Names already present on the target list (checked or not) are excluded.

**Households and invites**

- `household.leave` calls the SECURITY DEFINER function `leave_household`, which is atomic: a sole owner with other members remaining is refused with a typed error (UI explains: remove the other members first; ownership transfer is v2), and when the last member leaves, the same transaction deletes the household with its lists, items, invites, and queued notifications (FK cascade), so an orphaned household cannot exist. Owners cannot delete their own membership row directly; the database policy forbids it. There is no separate `household.delete` in v1.
- `invite.redeem` by an existing member of that household succeeds as a no-op even when the code is already consumed or expired (re-tapping a stale share link lands in the household instead of erroring); a valid code is never consumed by the no-op. For non-members, redemption consumes the code with a guarded update, so a code shared with two people concurrently admits exactly one new member, and every failure (unknown, consumed, expired, revoked) returns one indistinguishable error.
- Structural columns are immutable at the database layer (`lists.household_id`, `list_items.household_id`, `list_items.list_id`, enforced by BEFORE UPDATE triggers): a user belonging to two households cannot relocate lists or items between them.
- The signup trigger clamps `display_name` to 60 characters (also a table CHECK constraint) and accepts only http(s) `avatar_url` values from signup metadata.

**General**

- Deletes are hard deletes in v1; destructive UI requires a confirmation dialog and is identified by a trash icon, never by color alone (the brand color is already red).

## 7. Auth and onboarding

- Google OAuth is the primary sign-in (one tap on Android). Email magic link is the fallback, delivered through Resend SMTP.
- First sign-in creates the profile (trigger), capturing display name and Google avatar when present; magic-link signups default the display name to the email local part, editable in Settings.
- Onboarding fork: "Create a household" or "I have an invite code". Redeeming adds membership and lands the user on the household's lists.
- The invite share link format is `/join/<code>`; opening it while signed out goes through sign-in first, then redeems.

## 8. UX and design language

Screens: Sign-in, Onboarding fork, Home (active lists), List detail, History, Settings, Join. Bottom tab bar with three tabs: Λίστες, Ιστορικό, Ρυθμίσεις.

- **Home**: list cards (name, item counts, progress bar, last-activity line) ordered by `created_at` descending; the last-activity line is informational, not the sort key, and is defined as the most recent of the list's `created_at`, latest item `created_at`, and latest `checked_at`, rendered as relative time ("πριν 5 λεπτά"). Household switcher in the header; the active household id persists per device in localStorage (on open: stored id if still a member, otherwise the membership with the earliest `joined_at`; the choice is per device, not synced). Floating action button for a new list; a dashed placeholder card reserves the spot where "Online παραγγελία" will appear later.
- **List detail**: quick-add input pinned at the bottom that keeps focus after each add; suggestion chips above it; rows with checkbox, name, qty/note subtitle, adder avatar; checked rows cross out and move to the checked group below the unchecked group. Header shows "x από y στο καλάθι" and a short "Τέλος" button. Pressing Τέλος with unchecked items remaining opens a dialog offering to carry them into a new list (maps to `carryOver`); with everything checked, the list completes immediately without a dialog. Tap a row for a bottom sheet with name, qty, note, delete.
- **History**: completed trips with date, item count, who completed; "Ξανά" button clones the trip into a new active list.
- **Settings**: profile (name, photo), household members and pending invites (via `invite.list`), language toggle, theme (light/dark/system), notifications switch, leave household. The notifications switch reflects and controls only the current device's subscription; other devices are unaffected; there is no global per-user mute in v1.

Design language:

- Darkhold palette (MCU reference image, extracted 2026-06-11). Dark theme is the showcase: background `#0d0709`, surfaces `#1a0e10`, borders `#34161b`, rune-red accent `#e8192c` with a soft glow on primary actions. Light theme: warm paper `#faf6f5`, white surfaces, deep crimson accent `#b3121f` for AA contrast. Default follows the system.
- Member identity colors (avatar fallbacks) cycle by join order through purple `#7c3aed`, amber `#d97706`, teal `#0d9488`, sky `#0284c7`, chosen to never blend into the red accent.
- Icons are lucide-react exclusively. No emojis anywhere in the product.
- The em-dash character is banned from all UI copy and documentation.
- Every UI string goes through next-intl with full Greek and English catalogs; language is consistent across all views and switches instantly. Greek is the default locale. Labels stay terse ("Τέλος", "Ξανά").
- Utility first: large tap targets, one-hand reachability for the quick-add bar, no decorative friction.

## 9. Realtime and notifications

### Live sync (app open)

- One Realtime subscription per open household using `postgres_changes` on `lists` and `list_items`, both filtered with `household_id=eq.<activeHouseholdId>`. Events invalidate the relevant React Query caches. Migrations must add both tables to the `supabase_realtime` publication.
- INSERT and UPDATE events are authorized by RLS. DELETE events are neither filterable nor RLS-authorized (Supabase limitation): they arrive with only the old primary key, potentially from other households. The client treats DELETE events as untrusted invalidation hints: it ignores ids not present in its cache and otherwise invalidates the affected query. The UUID-only cross-household exposure is accepted for v1; broadcast-from-database removes it later, hidden behind the client's `useHouseholdRealtime` abstraction.

### Push (app closed)

- Subscription: created from a user-gesture prompt (the Settings switch and a one-time nudge after first list creation), stored per device. On iPhone this works only for the PWA installed from Safari; the UI detects standalone mode and guides installation first.
- Pipeline: Postgres triggers on item inserts and list completion write to `notification_queue` (SECURITY DEFINER, as in section 5); pg_cron runs every minute and, when unprocessed rows exist, calls the push Edge Function through pg_net (fire and forget, timeout raised above the 2-second default). The Edge Function reads the unprocessed rows, groups them, builds digests, sends, marks rows processed, and deletes subscriptions that return 404/410.
- Edge Function authentication: deployed with `verify_jwt = false` and validating a shared secret header instead; the secret lives in Supabase Vault and the cron SQL reads it via `vault.decrypted_secrets` to build the header, with the same value set as an Edge Function secret for comparison. Without this, pg_net's call is rejected with 401 before the function runs.
- Digest grouping: at most one notification per (recipient, list, actor, event type) group per flush, for example "Η Μαρία πρόσθεσε 3 προϊόντα στο Σούπερ μάρκετ". Events from different actors or lists yield separate notifications; they are never merged into a generic digest. Text is localized via the recipient's `profiles.locale`. The actor never receives a notification for their own action. Sending uses VAPID web push via `jsr:@negrel/webpush` (npm web-push is Deno-incompatible).
- There is no server-side presence detection: queued events are pushed to every non-actor member even if their app is open and already live-updated. On the Android/Chrome path, the service worker's push handler calls `clients.matchAll({ type: "window" })` and suppresses the notification when a visible client is already showing that list. On Safari's declarative path this check is unavailable and an occasional duplicate after a live update is accepted.
- Payloads use the Declarative Web Push JSON shape (`"web_push": 8030`, title plus navigate URL) and the service worker keeps classic `push` and `notificationclick` handlers so one payload works on Android Chrome and Safari 18.4+.
- The navigate URL is `/lists/<listId>`; the household is derived server-side from the list. Opening it sets and persists the active household to that list's household. If the user is no longer a member, the standard not-found state is shown.
- Push is best-effort by design; the source of truth is always the list itself.

## 10. Offline behavior and error handling

- Optimistic UI for add, check, edit, with rollback and a sonner toast on server rejection.
- Serwist precaches the app shell, so the installed app always opens; React Query's persisted cache serves the last-known lists read-only. A visible banner indicates offline; mutations are disabled while offline in v1.
- Realtime is an enhancement, not a dependency: on reconnect or app focus, React Query refetches and the worst case is brief staleness.
- All tRPC inputs are Zod-validated; errors map to typed TRPCError codes; the UI distinguishes "no permission" (should not happen in honest flows), "not found" (stale link), and "offline/unreachable" (retry screen).
- If Supabase is unreachable (paused or down), the app shows a friendly full-screen retry state rather than crashing. The keep-alive cron (section 12) makes pausing practically impossible.
- React error boundary at the route level with a reset action.

## 11. Future: supermarket ordering

v1 ships only an interface and a stub so the boundary is real from day one:

```ts
interface SupermarketProvider {
  id: string;                                   // 'sklavenitis'
  searchProduct(query: string): Promise<ProviderProduct[]>;
  createOrder(items: OrderItem[]): Promise<ProviderOrder>;
  orderStatus(orderId: string): Promise<OrderStatus>;
}
```

- `supermarket.providers.list` returns the registered providers (empty in v1); `supermarket.createOrder(listId)` maps list items to `OrderItem`s and delegates.
- Design consequences already absorbed: items carry optional qty and note; lists are the unit of ordering; the Home screen reserves the entry point; provider credentials will live in server-side env vars only.
- Sklavenitis has no public API today; the adapter will be written when the integration becomes concrete (official API, partner program, or supervised automation, to be evaluated then). Nothing in v1 depends on that choice.

## 12. Operations

- **Deploys**: GitHub main branch auto-deploys to Vercel; PRs get preview URLs. Supabase schema lives in `supabase/migrations` and is applied with the Supabase CLI (locally `supabase db push`, in CI on merge).
- **Keep-alive**: a Vercel Hobby daily cron (Hobby allows daily frequency) hits `/api/keepalive`, which performs a real database query; this defeats the Supabase Free 7-day inactivity pause. Restoring a paused project is a manual dashboard action and is to be avoided.
- **Backups**: Supabase Free has no automatic backups. A monthly GitHub Actions workflow runs `pg_dump` and stores the artifact (90-day retention is acceptable for shopping lists).
- **Secrets**: Google OAuth credentials and Resend SMTP key in Supabase Auth settings; VAPID key pair in Supabase Edge Function secrets with the public key in the client env; the cron-to-function shared secret in Supabase Vault and Edge Function secrets; Supabase URL and anon key in Vercel env. No secrets in the repo.
- **Environments**: the Free org allows 2 active projects; v1 uses a single production project plus the local CLI stack for development and testing, keeping the second slot free.
- **TWA later (documented now)**: `public/.well-known/assetlinks.json` served from the production origin; the SHA-256 fingerprint must be the Play App Signing key from the Play Console, not the local upload key; internal testing track suffices for family distribution and avoids the 12-tester/14-day closed-test requirement; one-time 25 USD fee; target API level follows Play's floor (Android 16 / API 36 from 2026-08-31).

## 13. Testing

- **Unit/integration**: Vitest. tRPC procedures exercised through a direct server-side caller against the local Supabase stack (Docker via Supabase CLI), covering the list lifecycle (complete with and without carry-over, zero-unchecked and empty-list cases, reorder, completed-list immutability), invite redemption edge cases (expired, reused, already-member no-op, code normalization), and suggestion ranking (normalization, exclusion, empty prefix).
- **RLS isolation suite** (security-critical): two users in two different households assert, at the SQL layer, that every cross-household read and write fails: profiles, lists, items, invites, subscriptions. Includes the bootstrap and recursion regressions: `create_household` works for a brand-new user, and membership policies do not produce 42P17.
- **E2E**: Playwright golden path on the local stack: sign in (test user), create household, generate and redeem an invite (second context), add items from both sessions, observe live sync, check items, complete with carry-over, reorder from History, switch language and theme.
- **CI**: GitHub Actions free tier runs typecheck, lint, unit, RLS, and E2E on every push.

## 14. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Supabase Free project pauses after 7 idle days | Daily keep-alive cron with a real query |
| Magic-link email undeliverable on built-in mailer | Resend SMTP from day one; Google OAuth primary |
| iPhone push limitations | Push only after PWA install from Safari; UI guides installation; Android unaffected |
| Realtime connection drops in-store | React Query refetch on reconnect/focus; lists never depend on the socket |
| RLS policy recursion or bootstrap bugs | SECURITY DEFINER helper pattern specified up front; regression tests in the RLS suite |
| Sklavenitis API may never materialize publicly | Integration isolated behind `SupermarketProvider`; v1 has zero dependency on it |
| Free-tier limits (500 MB DB, 5 GB egress, 1 GB storage) | Two-user scale is orders of magnitude below all of them; avatars resized client-side |

## 15. Success criteria

- Both partners install the PWA and use it for real shopping weeks, replacing chat messages for groceries.
- Adding an item takes under two seconds from opening the installed app.
- A list change on one phone appears on the other in under a second while open, and as a single batched notification when closed.
- Monthly cost: 0 euros.
