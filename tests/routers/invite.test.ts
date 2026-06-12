import { describe, it, expect } from "vitest";
import { appRouter } from "@/server/routers/_app";
import { createTestUser, type TestUser } from "../helpers";
import { CODE_ALPHABET, normalizeCode } from "@/server/invite-code";

function callerFor(u: TestUser) {
  return appRouter.createCaller({ supabase: u.client, user: u.user });
}

describe("invite router", () => {
  it("create returns an 8-char code from the safe alphabet and a share link", async () => {
    const a = await createTestUser("inv-a");
    const ca = callerFor(a);
    const h = await ca.household.create({ name: "H" });
    const inv = await ca.invite.create({ householdId: h.id });
    expect(inv.code).toHaveLength(8);
    for (const ch of inv.code) expect(CODE_ALPHABET).toContain(ch);
    expect(inv.link).toBe(`${process.env.NEXT_PUBLIC_APP_URL}/join/${inv.code}`);
  });

  it("redeem joins with messy input; list shows pending; revoke removes", async () => {
    const a = await createTestUser("inv-b");
    const b = await createTestUser("inv-c");
    const ca = callerFor(a);
    const h = await ca.household.create({ name: "H" });
    const inv = await ca.invite.create({ householdId: h.id });

    const joined = await callerFor(b).invite.redeem({ code: ` ${inv.code.toLowerCase()} ` });
    expect(joined.id).toBe(h.id);

    const inv2 = await ca.invite.create({ householdId: h.id });
    let pending = await ca.invite.list({ householdId: h.id });
    expect(pending.map((i) => i.code)).toContain(inv2.code);
    expect(pending.map((i) => i.code)).not.toContain(inv.code); // consumed

    await ca.invite.revoke({ inviteId: inv2.id });
    pending = await ca.invite.list({ householdId: h.id });
    expect(pending).toHaveLength(0);
  });

  it("redeem with an unknown code throws NOT_FOUND", async () => {
    const u = await createTestUser("inv-d");
    await expect(callerFor(u).invite.redeem({ code: "WRONG999" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("normalizeCode strips spaces and dashes and uppercases", () => {
    expect(normalizeCode(" ab-cd 23 45 ")).toBe("ABCD2345");
  });
});
