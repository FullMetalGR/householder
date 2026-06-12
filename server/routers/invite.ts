import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { generateCode, normalizeCode } from "@/server/invite-code";

export const inviteRouter = router({
  create: protectedProcedure
    .input(z.object({ householdId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const code = generateCode();
      const { data, error } = await ctx.supabase
        .from("invites")
        .insert({ household_id: input.householdId, code, created_by: ctx.user.id })
        .select()
        .single();
      if (error) {
        // 42501 = RLS policy violation (non-member): hide existence as NOT_FOUND.
        if (error.code === "42501") throw new TRPCError({ code: "NOT_FOUND" });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      return { ...data, link: `${process.env.NEXT_PUBLIC_APP_URL}/join/${data.code}` };
    }),

  list: protectedProcedure
    .input(z.object({ householdId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("invites")
        .select("*")
        .eq("household_id", input.householdId)
        .is("used_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: true });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  redeem: protectedProcedure
    .input(z.object({ code: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("redeem_invite", {
        p_code: normalizeCode(input.code),
      });
      if (error) {
        console.error("redeem_invite failed:", error);
        throw new TRPCError({ code: "NOT_FOUND", message: "invalid_or_expired_code" });
      }
      return data;
    }),

  revoke: protectedProcedure
    .input(z.object({ inviteId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("invites").delete().eq("id", input.inviteId).select();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      if (!data || data.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
      return { revoked: true };
    }),
});
