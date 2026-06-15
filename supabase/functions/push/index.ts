// Flush endpoint called by pg_cron through pg_net. Deployed with
// verify_jwt = false (config.toml); the shared secret header is the gate.
import * as webpush from "jsr:@negrel/webpush";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildDigests, type QueueRow, type Recipient } from "./digest.ts";

const vapidKeysJson = Deno.env.get("VAPID_KEYS_JSON");
if (!vapidKeysJson) throw new Error("VAPID_KEYS_JSON is not set");
const vapidKeys = await webpush.importVapidKeys(JSON.parse(vapidKeysJson), {
  extractable: false,
});
const appServer = await webpush.ApplicationServer.new({
  contactInformation: "mailto:" + (Deno.env.get("VAPID_CONTACT_EMAIL") ?? "webmaster@example.com"),
  vapidKeys,
});
const APP_URL = Deno.env.get("APP_URL") ?? "http://localhost:3000";

Deno.serve(async (req) => {
  if (req.headers.get("x-push-secret") !== Deno.env.get("PUSH_FUNCTION_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Atomic claim: marking before sending means a second invocation (pg_cron
  // fires every minute; a large flush can outlast that) selects nothing, so
  // overlapping flushes cannot double-send. A crash mid-send drops the batch,
  // which is the right trade for best-effort notifications.
  const { data: rows, error } = await supabase
    .from("notification_queue")
    .update({ processed_at: new Date().toISOString() })
    .is("processed_at", null)
    .select("id, household_id, list_id, actor_id, event, payload");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!rows || rows.length === 0) return Response.json({ processed: 0, sent: 0 });

  const claimedIds = rows.map((r) => r.id);
  // A transient join failure must not eat the batch: revert the claim so the
  // next cron tick retries, and surface the failure to pg_net's response log.
  async function failBatch(message: string): Promise<Response> {
    await supabase
      .from("notification_queue")
      .update({ processed_at: null })
      .in("id", claimedIds);
    return Response.json({ error: message }, { status: 500 });
  }

  const queueRows = rows as QueueRow[];
  const householdIds = [...new Set(queueRows.map((r) => r.household_id))];
  const listIds = [...new Set(queueRows.flatMap((r) => (r.list_id ? [r.list_id] : [])))];

  const { data: members, error: membersError } = await supabase
    .from("household_members")
    .select("household_id, user_id")
    .in("household_id", householdIds);
  if (membersError) return await failBatch(membersError.message);
  const memberIds = [...new Set((members ?? []).map((m) => m.user_id))];
  const actorIds = [...new Set(queueRows.flatMap((r) => (r.actor_id ? [r.actor_id] : [])))];

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, display_name, locale")
    .in("id", [...new Set([...memberIds, ...actorIds])]);
  if (profilesError) return await failBatch(profilesError.message);
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const { data: lists } = await supabase.from("lists").select("id, name").in("id", listIds);
  const listNames = Object.fromEntries((lists ?? []).map((l) => [l.id, l.name]));

  const recipientsByHousehold: Record<string, Recipient[]> = {};
  for (const m of members ?? []) {
    const p = profileById.get(m.user_id);
    (recipientsByHousehold[m.household_id] ??= []).push({
      userId: m.user_id,
      locale: p?.locale ?? "el",
    });
  }
  const actorNames = Object.fromEntries(
    actorIds.flatMap((id) => {
      const p = profileById.get(id);
      return p ? [[id, p.display_name]] : [];
    })
  );

  const digests = buildDigests({ rows: queueRows, recipientsByHousehold, listNames, actorNames });

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth, user_id")
    .in("user_id", [...new Set(digests.map((d) => d.recipientId))]);
  const subsByUser = new Map<string, NonNullable<typeof subs>>();
  for (const s of subs ?? []) {
    const arr = subsByUser.get(s.user_id) ?? [];
    arr.push(s);
    subsByUser.set(s.user_id, arr);
  }

  let sent = 0;
  const dead: string[] = [];
  for (const d of digests) {
    const payload = JSON.stringify({
      web_push: 8030,
      notification: { title: d.title, navigate: `${APP_URL}${d.navigate}`, lang: d.locale },
    });
    for (const s of subsByUser.get(d.recipientId) ?? []) {
      try {
        const subscriber = appServer.subscribe({
          endpoint: s.endpoint,
          keys: { auth: s.auth, p256dh: s.p256dh },
        });
        await subscriber.pushTextMessage(payload, { ttl: 3600 });
        sent++;
      } catch (e) {
        if (e instanceof webpush.PushMessageError && (e.isGone() || e.response.status === 404)) {
          dead.push(s.endpoint);
        } else {
          console.error("push failed", s.endpoint, String(e));
        }
      }
    }
  }

  if (dead.length > 0) {
    await supabase.from("push_subscriptions").delete().in("endpoint", [...new Set(dead)]);
  }

  return Response.json({ processed: queueRows.length, sent, pruned: dead.length });
});
