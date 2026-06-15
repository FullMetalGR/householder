import { describe, it, expect } from "vitest";
import { appRouter } from "@/server/routers/_app";
import { adminClient, createTestUser, type TestUser } from "../helpers";

function callerFor(u: TestUser) {
  return appRouter.createCaller({ supabase: u.client, user: u.user });
}

const sub = (endpoint: string) => ({
  endpoint,
  keys: { p256dh: "BPdh-test-key", auth: "auth-test" },
  userAgent: "vitest",
});

describe("push router", () => {
  it("subscribe stores one row per device and re-subscribe updates keys", async () => {
    const u = await createTestUser("push-sub");
    const caller = callerFor(u);
    const endpoint = `https://push.example/${u.id}`;
    await caller.push.subscribe(sub(endpoint));
    await caller.push.subscribe({ ...sub(endpoint), keys: { p256dh: "BPdh-2", auth: "auth-2" } });

    const { data } = await adminClient()
      .from("push_subscriptions").select("*").eq("endpoint", endpoint);
    expect(data).toHaveLength(1);
    expect(data![0].p256dh).toBe("BPdh-2");
    expect(data![0].user_id).toBe(u.id);
  });

  it("a second account on the same device claims the endpoint", async () => {
    const a = await createTestUser("push-claim-a");
    const b = await createTestUser("push-claim-b");
    const endpoint = `https://push.example/${a.id}-shared`;
    await callerFor(a).push.subscribe(sub(endpoint));
    await callerFor(b).push.subscribe(sub(endpoint));

    const { data } = await adminClient()
      .from("push_subscriptions").select("user_id").eq("endpoint", endpoint);
    expect(data).toHaveLength(1);
    expect(data![0].user_id).toBe(b.id);
  });

  it("unsubscribe deletes own row only; foreign endpoints are a no-op", async () => {
    const a = await createTestUser("push-unsub-a");
    const b = await createTestUser("push-unsub-b");
    const endpoint = `https://push.example/${a.id}-dev`;
    await callerFor(a).push.subscribe(sub(endpoint));
    await callerFor(b).push.unsubscribe({ endpoint });
    const { data: still } = await adminClient()
      .from("push_subscriptions").select("*").eq("endpoint", endpoint);
    expect(still).toHaveLength(1);

    await callerFor(a).push.unsubscribe({ endpoint });
    const { data: gone } = await adminClient()
      .from("push_subscriptions").select("*").eq("endpoint", endpoint);
    expect(gone).toHaveLength(0);
  });

  it("subscriptions are invisible across users", async () => {
    const a = await createTestUser("push-rls-a");
    const b = await createTestUser("push-rls-b");
    await callerFor(a).push.subscribe(sub(`https://push.example/${a.id}-rls`));
    const { data } = await b.client.from("push_subscriptions").select("*");
    expect(data).toEqual([]);
  });
});
