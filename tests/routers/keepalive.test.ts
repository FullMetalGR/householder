import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";

describe("keepalive", () => {
  it("is callable anonymously and returns a server timestamp", async () => {
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const { data, error } = await anon.rpc("keepalive");
    expect(error).toBeNull();
    expect(new Date(data as string).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });
});
