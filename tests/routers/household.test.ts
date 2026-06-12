import { describe, it, expect } from "vitest";
import { appRouter } from "@/server/routers/_app";
import { createTestUser, type TestUser } from "../helpers";

function callerFor(u: TestUser) {
  return appRouter.createCaller({ supabase: u.client, user: u.user });
}

describe("household router", () => {
  it("create returns the household and listMine includes it with role owner", async () => {
    const u = await createTestUser("hh-create");
    const caller = callerFor(u);
    const h = await caller.household.create({ name: "Σπίτι μας" });
    expect(h.name).toBe("Σπίτι μας");
    const mine = await caller.household.listMine();
    expect(mine).toHaveLength(1);
    expect(mine[0].role).toBe("owner");
    expect(mine[0].household.id).toBe(h.id);
  });

  it("rename works for members and 404s for outsiders", async () => {
    const a = await createTestUser("hh-rename-a");
    const b = await createTestUser("hh-rename-b");
    const h = await callerFor(a).household.create({ name: "Old" });
    const renamed = await callerFor(a).household.rename({ householdId: h.id, name: "New" });
    expect(renamed.name).toBe("New");
    await expect(
      callerFor(b).household.rename({ householdId: h.id, name: "Hacked" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("members.list shows profiles; members.remove is owner-only", async () => {
    const a = await createTestUser("hh-mem-a");
    const b = await createTestUser("hh-mem-b");
    const ca = callerFor(a);
    const h = await ca.household.create({ name: "H" });
    const inv = await ca.invite.create({ householdId: h.id });
    await callerFor(b).invite.redeem({ code: inv.code });

    const members = await ca.household.members.list({ householdId: h.id });
    expect(members).toHaveLength(2);
    expect(members.map((m) => m.role).sort()).toEqual(["member", "owner"]);

    await expect(
      callerFor(b).household.members.remove({ householdId: h.id, userId: a.id })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await ca.household.members.remove({ householdId: h.id, userId: b.id });
    expect(await ca.household.members.list({ householdId: h.id })).toHaveLength(1);
  });

  it("leave: sole owner with other members is refused; last member deletes household", async () => {
    const a = await createTestUser("hh-leave-a");
    const b = await createTestUser("hh-leave-b");
    const ca = callerFor(a);
    const cb = callerFor(b);
    const h = await ca.household.create({ name: "H" });
    const inv = await ca.invite.create({ householdId: h.id });
    await cb.invite.redeem({ code: inv.code });

    await expect(ca.household.leave({ householdId: h.id })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });

    await cb.household.leave({ householdId: h.id }); // member leaves fine
    await ca.household.leave({ householdId: h.id }); // now last member: household deleted
    expect(await ca.household.listMine()).toHaveLength(0);
  });
});
