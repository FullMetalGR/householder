import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { randomUUID } from "node:crypto";
import { router, protectedProcedure } from "@/server/trpc";
import type { Database } from "@/lib/supabase/database.types";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

function avatarPrefix(userId: string) {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${userId}/`;
}

const updateInput = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  locale: z.enum(["el", "en"]).optional(),
  avatarUrl: z.url().optional(), // set-only in v1; clearing (null) is deferred
});

export const profileRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("profiles").select("*").eq("id", ctx.user.id).single();
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    return data;
  }),

  update: protectedProcedure.input(updateInput).mutation(async ({ ctx, input }) => {
    if (input.avatarUrl) {
      if (!input.avatarUrl.startsWith(avatarPrefix(ctx.user.id))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "avatar_url_not_owned" });
      }
    }
    const patch: ProfileUpdate = {};
    if (input.displayName !== undefined) patch.display_name = input.displayName;
    if (input.locale !== undefined) patch.locale = input.locale;
    if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl;
    if (Object.keys(patch).length === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "empty_update" });
    }
    const { data, error } = await ctx.supabase
      .from("profiles").update(patch).eq("id", ctx.user.id).select().single();
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    return data;
  }),

  getAvatarUploadUrl: protectedProcedure.mutation(async ({ ctx }) => {
    const path = `${ctx.user.id}/${randomUUID()}.webp`;
    const { data, error } = await ctx.supabase.storage.from("avatars").createSignedUploadUrl(path);
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    const { data: pub } = ctx.supabase.storage.from("avatars").getPublicUrl(path);
    return { path, token: data.token, publicUrl: pub.publicUrl };
  }),
});
