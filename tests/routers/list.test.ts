import { describe, it, expect } from "vitest";
import { appRouter } from "@/server/routers/_app";
import { createTestUser, type TestUser } from "../helpers";

function callerFor(u: TestUser) {
  return appRouter.createCaller({ supabase: u.client, user: u.user });
}

async function setupHousehold(label: string) {
  const u = await createTestUser(label);
  const caller = callerFor(u);
  const h = await caller.household.create({ name: "H" });
  return { u, caller, h };
}

describe("list router", () => {
  it("create returns the list; outsiders get NOT_FOUND", async () => {
    const { caller, h } = await setupHousehold("ls-create");
    const list = await caller.list.create({ householdId: h.id, name: "Laiki" });
    expect(list.name).toBe("Laiki");
    expect(list.status).toBe("active");

    const outsider = await createTestUser("ls-create-out");
    await expect(
      callerFor(outsider).list.create({ householdId: h.id, name: "Nope" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("getActive orders by created_at desc with counts and lastActivity", async () => {
    const { caller, h } = await setupHousehold("ls-active");
    const first = await caller.list.create({ householdId: h.id, name: "First" });
    const second = await caller.list.create({ householdId: h.id, name: "Second" });
    await caller.item.add({ listId: first.id, name: "Milk" });
    const bread = await caller.item.add({ listId: first.id, name: "Bread" });
    await caller.item.setChecked({ itemId: bread.id, checked: true });

    const active = await caller.list.getActive({ householdId: h.id });
    expect(active.map((l) => l.id)).toEqual([second.id, first.id]);
    const f = active.find((l) => l.id === first.id)!;
    expect(f.total).toBe(2);
    expect(f.checkedCount).toBe(1);
    expect(new Date(f.lastActivity).getTime()).toBeGreaterThanOrEqual(
      new Date(first.created_at).getTime()
    );
  });

  it("get returns items unchecked-first then by position; outsiders get NOT_FOUND", async () => {
    const { caller, h } = await setupHousehold("ls-get");
    const list = await caller.list.create({ householdId: h.id, name: "L" });
    const a = await caller.item.add({ listId: list.id, name: "A" });
    const b = await caller.item.add({ listId: list.id, name: "B" });
    const c = await caller.item.add({ listId: list.id, name: "C" });
    await caller.item.setChecked({ itemId: b.id, checked: true });

    const got = await caller.list.get({ listId: list.id });
    expect(got.items.map((i) => i.id)).toEqual([a.id, c.id, b.id]);

    const outsider = await createTestUser("ls-get-out");
    await expect(callerFor(outsider).list.get({ listId: list.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("rename works on active, rejects completed with BAD_REQUEST", async () => {
    const { caller, h } = await setupHousehold("ls-rename");
    const list = await caller.list.create({ householdId: h.id, name: "Old" });
    const renamed = await caller.list.rename({ listId: list.id, name: "New" });
    expect(renamed.name).toBe("New");

    await expect(
      caller.list.rename({ listId: crypto.randomUUID(), name: "Ghost" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await caller.item.add({ listId: list.id, name: "X" });
    await caller.list.complete({ listId: list.id, carryOver: false });
    await expect(caller.list.rename({ listId: list.id, name: "Z" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "list_completed",
    });
  });

  it("complete: empty list is BAD_REQUEST; zero unchecked ignores carryOver", async () => {
    const { caller, h } = await setupHousehold("ls-complete");
    const empty = await caller.list.create({ householdId: h.id, name: "Empty" });
    await expect(caller.list.complete({ listId: empty.id, carryOver: false })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "empty_list",
    });

    const done = await caller.list.create({ householdId: h.id, name: "Done" });
    const x = await caller.item.add({ listId: done.id, name: "X" });
    await caller.item.setChecked({ itemId: x.id, checked: true });
    const result = await caller.list.complete({ listId: done.id, carryOver: true });
    expect(result.carryListId).toBeNull();
    expect(await caller.list.getActive({ householdId: h.id })).toHaveLength(1);
  });

  it("complete with carryOver copies only unchecked items, renumbered, added_by completer", async () => {
    const { u: a, caller: ca, h } = await setupHousehold("ls-carry");
    const invite = await ca.invite.create({ householdId: h.id });
    const b = await createTestUser("ls-carry-b");
    const cb = callerFor(b);
    await cb.invite.redeem({ code: invite.code });

    const list = await ca.list.create({ householdId: h.id, name: "Weekly" });
    const milk = await ca.item.add({ listId: list.id, name: "Milk", qty: "2", note: "fresh" });
    const eggs = await ca.item.add({ listId: list.id, name: "Eggs" });
    await ca.item.add({ listId: list.id, name: "Bread" });
    await ca.item.setChecked({ itemId: eggs.id, checked: true });

    const result = await cb.list.complete({ listId: list.id, carryOver: true });
    expect(result.carryListId).not.toBeNull();

    const carry = await cb.list.get({ listId: result.carryListId! });
    expect(carry.name).toBe("Weekly");
    expect(carry.status).toBe("active");
    expect(carry.items.map((i) => i.name)).toEqual(["Milk", "Bread"]);
    expect(carry.items.map((i) => Number(i.position))).toEqual([1, 2]);
    expect(carry.items[0].qty).toBe("2");
    expect(carry.items[0].note).toBe("fresh");
    expect(carry.items.every((i) => i.added_by === b.id)).toBe(true);
    expect(carry.items.every((i) => !i.checked)).toBe(true);
    expect(milk.added_by).toBe(a.id);

    await expect(cb.list.complete({ listId: list.id, carryOver: false })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "list_completed",
    });
  });

  it("completed lists are immutable through the API", async () => {
    const { caller, h } = await setupHousehold("ls-frozen");
    const list = await caller.list.create({ householdId: h.id, name: "L" });
    const item = await caller.item.add({ listId: list.id, name: "X" });
    await caller.list.complete({ listId: list.id, carryOver: false });

    const frozen = { code: "BAD_REQUEST", message: "list_completed" };
    await expect(caller.item.add({ listId: list.id, name: "Y" })).rejects.toMatchObject(frozen);
    await expect(caller.item.setChecked({ itemId: item.id, checked: true })).rejects.toMatchObject(frozen);
  });

  it("reorderFrom clones a completed trip fully unchecked; active source rejected", async () => {
    const { caller, h } = await setupHousehold("ls-reorder");
    const list = await caller.list.create({ householdId: h.id, name: "Trip" });
    const x = await caller.item.add({ listId: list.id, name: "X" });
    await caller.item.add({ listId: list.id, name: "Y" });
    await caller.item.setChecked({ itemId: x.id, checked: true });

    await expect(caller.list.reorderFrom({ listId: list.id })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "not_completed",
    });

    await caller.list.complete({ listId: list.id, carryOver: false });
    const { newListId } = await caller.list.reorderFrom({ listId: list.id });
    const clone = await caller.list.get({ listId: newListId });
    expect(clone.name).toBe("Trip");
    expect(clone.items).toHaveLength(2);
    expect(clone.items.every((i) => !i.checked)).toBe(true);
    expect(clone.items.map((i) => Number(i.position))).toEqual([1, 2]);

    const outsider = await createTestUser("ls-reorder-out");
    await expect(callerFor(outsider).list.reorderFrom({ listId: list.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("getHistory paginates by completed_at desc with itemCount and completer profile", async () => {
    const { caller, h } = await setupHousehold("ls-history");
    const names = ["T1", "T2", "T3"];
    for (const name of names) {
      const list = await caller.list.create({ householdId: h.id, name });
      await caller.item.add({ listId: list.id, name: "X" });
      await caller.list.complete({ listId: list.id, carryOver: false });
    }

    const page = await caller.list.getHistory({ householdId: h.id });
    expect(page.trips.map((t) => t.name)).toEqual(["T3", "T2", "T1"]);
    expect(page.trips[0].itemCount).toBe(1);
    expect(page.trips[0].completed_by_profile?.display_name).toBeTruthy();
    expect(page.nextCursor).toBeNull();

    const rest = await caller.list.getHistory({
      householdId: h.id,
      cursor: page.trips[0].completed_at,
    });
    expect(rest.trips.map((t) => t.name)).toEqual(["T2", "T1"]);
  });

  it("delete removes active or completed lists; outsiders get NOT_FOUND", async () => {
    const { caller, h } = await setupHousehold("ls-delete");
    const list = await caller.list.create({ householdId: h.id, name: "L" });
    const outsider = await createTestUser("ls-delete-out");
    await expect(callerFor(outsider).list.delete({ listId: list.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await caller.list.delete({ listId: list.id });
    expect(await caller.list.getActive({ householdId: h.id })).toHaveLength(0);

    const trip = await caller.list.create({ householdId: h.id, name: "Trip" });
    await caller.item.add({ listId: trip.id, name: "X" });
    await caller.list.complete({ listId: trip.id, carryOver: false });
    await caller.list.delete({ listId: trip.id });
    expect((await caller.list.getHistory({ householdId: h.id })).trips).toHaveLength(0);
  });
});
