import { describe, it, expect } from "vitest";
import { appRouter } from "@/server/routers/_app";
import { adminClient, createTestUser, type TestUser } from "../helpers";

function callerFor(u: TestUser) {
  return appRouter.createCaller({ supabase: u.client, user: u.user });
}

describe("notification queue", () => {
  it("item.add enqueues items_added with actor and payload", async () => {
    const u = await createTestUser("nq-add");
    const caller = callerFor(u);
    const h = await caller.household.create({ name: "H" });
    const list = await caller.list.create({ householdId: h.id, name: "L" });
    await caller.item.add({ listId: list.id, name: "Γάλα" });

    const { data } = await adminClient()
      .from("notification_queue")
      .select("*")
      .eq("household_id", h.id)
      .eq("event", "items_added");
    expect(data).toHaveLength(1);
    expect(data![0].actor_id).toBe(u.id);
    expect(data![0].list_id).toBe(list.id);
    expect((data![0].payload as { item_name: string }).item_name).toBe("Γάλα");
    expect(data![0].processed_at).toBeNull();
  });

  it("list completion enqueues list_completed once", async () => {
    const u = await createTestUser("nq-complete");
    const caller = callerFor(u);
    const h = await caller.household.create({ name: "H" });
    const list = await caller.list.create({ householdId: h.id, name: "Λαϊκή" });
    await caller.item.add({ listId: list.id, name: "X" });
    await caller.list.complete({ listId: list.id, carryOver: false });

    const { data } = await adminClient()
      .from("notification_queue")
      .select("*")
      .eq("household_id", h.id)
      .eq("event", "list_completed");
    expect(data).toHaveLength(1);
    expect((data![0].payload as { list_name: string }).list_name).toBe("Λαϊκή");
    expect(data![0].list_id).toBe(list.id);
  });

  it("carry-over copies also enqueue items_added for the new list (accepted behavior)", async () => {
    const u = await createTestUser("nq-carry");
    const caller = callerFor(u);
    const h = await caller.household.create({ name: "H" });
    const list = await caller.list.create({ householdId: h.id, name: "L" });
    await caller.item.add({ listId: list.id, name: "A" });
    await caller.item.add({ listId: list.id, name: "B" });
    const result = await caller.list.complete({ listId: list.id, carryOver: true });

    const { data } = await adminClient()
      .from("notification_queue")
      .select("*")
      .eq("household_id", h.id)
      .eq("list_id", result.carryListId!)
      .eq("event", "items_added");
    expect(data).toHaveLength(2);
  });

  it("authenticated clients cannot read the queue at all", async () => {
    const u = await createTestUser("nq-rls");
    const { error } = await u.client.from("notification_queue").select("*");
    expect(error).not.toBeNull();
    expect(error!.code).toBe("42501");
  });
});
