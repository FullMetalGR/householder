import { describe, it, expect } from "vitest";
import { appRouter } from "@/server/routers/_app";
import { createTestUser, type TestUser } from "../helpers";

function callerFor(u: TestUser) {
  return appRouter.createCaller({ supabase: u.client, user: u.user });
}

async function setupList(label: string) {
  const u = await createTestUser(label);
  const caller = callerFor(u);
  const h = await caller.household.create({ name: "H" });
  const list = await caller.list.create({ householdId: h.id, name: "L" });
  return { u, caller, h, list };
}

describe("item router", () => {
  it("add assigns sequential positions and stores qty/note/added_by", async () => {
    const { u, caller, list } = await setupList("it-add");
    const a = await caller.item.add({ listId: list.id, name: "Milk", qty: "2L", note: "fresh" });
    const b = await caller.item.add({ listId: list.id, name: "Bread" });
    const c = await caller.item.add({ listId: list.id, name: "Eggs" });
    expect([a, b, c].map((i) => Number(i.position))).toEqual([1, 2, 3]);
    expect(a.qty).toBe("2L");
    expect(a.note).toBe("fresh");
    expect(b.qty).toBeNull();
    expect(a.added_by).toBe(u.id);
    expect(a.checked).toBe(false);

    const outsider = await createTestUser("it-add-out");
    await expect(
      callerFor(outsider).item.add({ listId: list.id, name: "Hack" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("setChecked records and clears checked_by/checked_at; explicit state converges", async () => {
    const { u, caller, list } = await setupList("it-check");
    const item = await caller.item.add({ listId: list.id, name: "Milk" });

    const checked = await caller.item.setChecked({ itemId: item.id, checked: true });
    expect(checked.checked).toBe(true);
    expect(checked.checked_by).toBe(u.id);
    expect(checked.checked_at).not.toBeNull();

    const again = await caller.item.setChecked({ itemId: item.id, checked: true });
    expect(again.checked).toBe(true);

    const cleared = await caller.item.setChecked({ itemId: item.id, checked: false });
    expect(cleared.checked).toBe(false);
    expect(cleared.checked_by).toBeNull();
    expect(cleared.checked_at).toBeNull();

    const outsider = await createTestUser("it-check-out");
    await expect(
      callerFor(outsider).item.setChecked({ itemId: item.id, checked: true })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("update patches name/qty/note, clears with null, rejects empty patch", async () => {
    const { caller, list } = await setupList("it-update");
    const item = await caller.item.add({ listId: list.id, name: "Milk", qty: "1" });

    const renamed = await caller.item.update({ itemId: item.id, name: "Goat milk" });
    expect(renamed.name).toBe("Goat milk");
    expect(renamed.qty).toBe("1");

    const cleared = await caller.item.update({ itemId: item.id, qty: null });
    expect(cleared.qty).toBeNull();

    await expect(caller.item.update({ itemId: item.id })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("remove deletes; outsiders get NOT_FOUND", async () => {
    const { caller, list } = await setupList("it-remove");
    const item = await caller.item.add({ listId: list.id, name: "Milk" });
    const outsider = await createTestUser("it-remove-out");
    await expect(callerFor(outsider).item.remove({ itemId: item.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await caller.item.remove({ itemId: item.id });
    const got = await caller.list.get({ listId: list.id });
    expect(got.items).toHaveLength(0);
  });

  it("suggest ranks by usage, dedupes accents/case, excludes target-list names", async () => {
    const { caller, h, list } = await setupList("it-suggest");

    const trip1 = await caller.list.create({ householdId: h.id, name: "T1" });
    for (const name of ["Γάλα", "Ψωμί", "Αυγά"]) {
      await caller.item.add({ listId: trip1.id, name });
    }
    await caller.list.complete({ listId: trip1.id, carryOver: false });

    const trip2 = await caller.list.create({ householdId: h.id, name: "T2" });
    await caller.item.add({ listId: trip2.id, name: "γαλα" });
    await caller.list.complete({ listId: trip2.id, carryOver: false });

    await caller.item.add({ listId: list.id, name: "Αυγά" });

    const top = await caller.item.suggest({ listId: list.id, prefix: "" });
    expect(top).toEqual(["γαλα", "Ψωμί"]);

    expect(await caller.item.suggest({ listId: list.id, prefix: "ΓΑ" })).toEqual(["γαλα"]);
    expect(await caller.item.suggest({ listId: list.id, prefix: "ψ" })).toEqual(["Ψωμί"]);
    expect(await caller.item.suggest({ listId: list.id, prefix: "zzz" })).toEqual([]);

    const outsider = await createTestUser("it-suggest-out");
    expect(await callerFor(outsider).item.suggest({ listId: list.id, prefix: "" })).toEqual([]);
  });

  it("suggest caps at 10", async () => {
    const { caller, h, list } = await setupList("it-suggest-cap");
    const big = await caller.list.create({ householdId: h.id, name: "Big" });
    for (let i = 1; i <= 12; i++) {
      await caller.item.add({ listId: big.id, name: `Item ${i}` });
    }
    await caller.list.complete({ listId: big.id, carryOver: false });
    const suggestions = await caller.item.suggest({ listId: list.id, prefix: "" });
    expect(suggestions).toHaveLength(10);
  });
});
