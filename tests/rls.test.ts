import { describe, it, expect, beforeAll } from "vitest";
import { createTestUser, type TestUser } from "./helpers";

describe("RLS isolation", () => {
  const SUF = Array.from({ length: 4 }, () =>
    "ABCDEFGHJKMNPQRSTVWXYZ23456789"[Math.floor(Math.random() * 30)]
  ).join("");
  let alice: TestUser; // owner of H1
  let bob: TestUser;   // owner of H2, NOT a member of H1 (until the redeem test)
  let h1: string;
  let h2: string;

  beforeAll(async () => {
    alice = await createTestUser("alice");
    bob = await createTestUser("bob");
    const { data: ha, error: ea } = await alice.client.rpc("create_household", { p_name: "H1" });
    expect(ea).toBeNull();
    h1 = ha.id;
    const { data: hb, error: eb } = await bob.client.rpc("create_household", { p_name: "H2" });
    expect(eb).toBeNull();
    h2 = hb.id;
  });

  it("create_household works for a brand-new user (bootstrap, no 42P17)", async () => {
    const carol = await createTestUser("carol");
    const { data, error } = await carol.client.rpc("create_household", { p_name: "H3" });
    expect(error).toBeNull();
    expect(data.name).toBe("H3");
  });

  it("membership read does not recurse (42P17 regression)", async () => {
    const { data, error } = await alice.client.from("household_members").select("*");
    expect(error).toBeNull();
    expect(data!.length).toBe(1);
  });

  it("non-member cannot see the household or its members", async () => {
    const { data: hh } = await bob.client.from("households").select("*").eq("id", h1);
    expect(hh).toEqual([]);
    const { data: mm } = await bob.client.from("household_members").select("*").eq("household_id", h1);
    expect(mm).toEqual([]);
  });

  it("non-member cannot read another user's profile until they share a household", async () => {
    const { data: before } = await bob.client.from("profiles").select("*").eq("id", alice.id);
    expect(before).toEqual([]);
  });

  it("non-member cannot insert, update, or delete lists in a foreign household", async () => {
    const { error: insertErr } = await bob.client
      .from("lists")
      .insert({ household_id: h1, name: "intrusion", created_by: bob.id });
    expect(insertErr).not.toBeNull(); // RLS violation

    const { data: aliceList } = await alice.client
      .from("lists")
      .insert({ household_id: h1, name: "groceries", created_by: alice.id })
      .select()
      .single();

    const { data: upd } = await bob.client
      .from("lists").update({ name: "hacked" }).eq("id", aliceList!.id).select();
    expect(upd).toEqual([]);
    const { data: del } = await bob.client
      .from("lists").delete().eq("id", aliceList!.id).select();
    expect(del).toEqual([]);
  });

  it("non-member cannot create invites for a foreign household", async () => {
    const { error } = await bob.client
      .from("invites")
      .insert({ household_id: h1, code: `BADC${SUF}`, created_by: bob.id });
    expect(error).not.toBeNull();
  });

  it("notification_queue is invisible to clients", async () => {
    const { data, error } = await alice.client.from("notification_queue").select("*");
    expect(error).not.toBeNull(); // no grant: permission denied
    expect(data).toBeNull();
  });

  it("push subscriptions are private per user", async () => {
    await alice.client.from("push_subscriptions").insert({
      user_id: alice.id, endpoint: `https://push.test/${alice.id}`, p256dh: "k", auth: "a",
    });
    const { data } = await bob.client.from("push_subscriptions").select("*");
    expect(data).toEqual([]);
  });

  it("redeem flow: bob joins H1 via invite, then sees it; second redeem is a no-op", async () => {
    const { data: invite } = await alice.client
      .from("invites")
      .insert({ household_id: h1, code: `JOIN${SUF}`, created_by: alice.id })
      .select()
      .single();
    expect(invite).not.toBeNull();

    // normalization: lowercase with spaces and dashes still redeems
    const { data: joined, error } = await bob.client.rpc("redeem_invite", { p_code: ` join-${SUF.toLowerCase()} ` });
    expect(error).toBeNull();
    expect(joined.id).toBe(h1);

    const { data: again, error: e2 } = await bob.client.rpc("redeem_invite", { p_code: `JOIN${SUF}` });
    expect(e2).toBeNull(); // already-member no-op
    expect(again.id).toBe(h1);

    const { data: hh } = await bob.client.from("households").select("*").eq("id", h1);
    expect(hh!.length).toBe(1);
    const { data: prof } = await bob.client.from("profiles").select("*").eq("id", alice.id);
    expect(prof!.length).toBe(1); // now shares a household
  });

  it("expired invites do not redeem", async () => {
    const dave = await createTestUser("dave");
    await alice.client.from("invites").insert({
      household_id: h1, code: `EXPD${SUF}`, created_by: alice.id,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    });
    const { error } = await dave.client.rpc("redeem_invite", { p_code: `EXPD${SUF}` });
    expect(error).not.toBeNull();
  });

  it("sole owner with other members cannot delete their own membership row", async () => {
    // bob is now a member of H1 alongside owner alice
    const { data } = await alice.client
      .from("household_members")
      .delete()
      .eq("household_id", h1)
      .eq("user_id", alice.id)
      .select();
    expect(data).toEqual([]); // policy blocks owner self-delete entirely
  });

  it("a consumed code cannot be redeemed again", async () => {
    const eve = await createTestUser("eve");
    const frank = await createTestUser("frank");
    await alice.client.from("invites").insert({ household_id: h1, code: `ONCE${SUF}`, created_by: alice.id });
    const { error: e1 } = await eve.client.rpc("redeem_invite", { p_code: `ONCE${SUF}` });
    expect(e1).toBeNull();
    const { error: e2 } = await frank.client.rpc("redeem_invite", { p_code: `ONCE${SUF}` });
    expect(e2).not.toBeNull();
  });

  it("owner cannot orphan a household; leave_household cascades instead", async () => {
    const grace = await createTestUser("grace");
    const { data: h4 } = await grace.client.rpc("create_household", { p_name: "H4" });
    const { data: del } = await grace.client.from("household_members")
      .delete().eq("household_id", h4.id).eq("user_id", grace.id).select();
    expect(del).toEqual([]); // owners can never self-delete the membership row
    const { error } = await grace.client.rpc("leave_household", { p_household_id: h4.id });
    expect(error).toBeNull();
    const { data: gone } = await grace.client.from("households").select("*").eq("id", h4.id);
    expect(gone).toEqual([]); // household cascade-deleted
  });

  it("lists cannot be relocated across households", async () => {
    // bob is a member of both H1 (via invite) and H2 (owner)
    const { data: list } = await bob.client.from("lists")
      .insert({ household_id: h1, name: "movable?", created_by: bob.id }).select().single();
    const { error } = await bob.client.from("lists")
      .update({ household_id: h2 }).eq("id", list!.id);
    expect(error).not.toBeNull(); // household_id_immutable trigger
  });
});
