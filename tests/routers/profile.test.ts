import { describe, it, expect } from "vitest";
import { appRouter } from "@/server/routers/_app";
import { createTestUser } from "../helpers";

describe("profile router", () => {
  it("get returns the trigger-created profile with email local part as name", async () => {
    const u = await createTestUser("profilia");
    const caller = appRouter.createCaller({ supabase: u.client, user: u.user });
    const p = await caller.profile.get();
    expect(p.id).toBe(u.id);
    expect(p.display_name).toBe(u.email.split("@")[0]);
    expect(p.locale).toBe("el");
  });

  it("update changes display name and locale, rejects empty name", async () => {
    const u = await createTestUser("updater");
    const caller = appRouter.createCaller({ supabase: u.client, user: u.user });
    const p = await caller.profile.update({ displayName: "Μαρία", locale: "en" });
    expect(p.display_name).toBe("Μαρία");
    expect(p.locale).toBe("en");
    await expect(caller.profile.update({ displayName: "  " })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("update rejects an avatarUrl outside the caller's own folder", async () => {
    const u = await createTestUser("avatar");
    const caller = appRouter.createCaller({ supabase: u.client, user: u.user });
    await expect(
      caller.profile.update({ avatarUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/some-other-user/x.webp` })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("getAvatarUploadUrl returns a signed upload target in the caller's folder", async () => {
    const u = await createTestUser("uploader");
    const caller = appRouter.createCaller({ supabase: u.client, user: u.user });
    const r = await caller.profile.getAvatarUploadUrl();
    expect(r.path.startsWith(`${u.id}/`)).toBe(true);
    expect(r.token).toBeTruthy();
    expect(r.publicUrl).toContain(`/avatars/${r.path}`);
  });
});
