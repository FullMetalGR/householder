import { describe, it, expect } from "vitest";
import { appRouter } from "@/server/routers/_app";
import { createTestUser } from "../helpers";

describe("supermarket stub", () => {
  it("providers.list is empty in v1", async () => {
    const u = await createTestUser("sm-list");
    const caller = appRouter.createCaller({ supabase: u.client, user: u.user });
    expect(await caller.supermarket.providers.list()).toEqual([]);
  });

  it("createOrder fails with no_provider", async () => {
    const u = await createTestUser("sm-order");
    const caller = appRouter.createCaller({ supabase: u.client, user: u.user });
    const h = await caller.household.create({ name: "H" });
    const list = await caller.list.create({ householdId: h.id, name: "L" });
    await expect(
      caller.supermarket.createOrder({ listId: list.id, providerId: "sklavenitis" })
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "no_provider" });
  });
});
