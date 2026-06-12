import { describe, it, expect } from "vitest";
import { appRouter } from "@/server/routers/_app";
import { createTestUser } from "../helpers";

describe("trpc foundation", () => {
  it("health.ping works for an authenticated caller", async () => {
    const u = await createTestUser("health");
    const caller = appRouter.createCaller({ supabase: u.client, user: u.user });
    expect(await caller.health.ping()).toEqual({ ok: true });
  });

  it("protected procedures reject anonymous callers", async () => {
    const { createClient } = await import("@supabase/supabase-js");
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
    const caller = appRouter.createCaller({ supabase: anon, user: null });
    await expect(caller.health.ping()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
