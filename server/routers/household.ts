import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";

const householdId = z.object({ householdId: z.uuid() });

export const householdRouter = router({
  create: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(80) }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("create_household", { p_name: input.name });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  rename: protectedProcedure
    .input(householdId.extend({ name: z.string().trim().min(1).max(80) }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("households").update({ name: input.name })
        .eq("id", input.householdId).select().maybeSingle();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      if (!data) throw new TRPCError({ code: "NOT_FOUND" });
      return data;
    }),

  listMine: protectedProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from("household_members")
      .select("role, joined_at, household:households(*)")
      .eq("user_id", ctx.user.id)
      .order("joined_at", { ascending: true });
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    return data;
  }),

  members: router({
    list: protectedProcedure.input(householdId).query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("household_members")
        .select("user_id, role, joined_at, profile:profiles(display_name, avatar_url)")
        .eq("household_id", input.householdId)
        .order("joined_at", { ascending: true });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

    remove: protectedProcedure
      .input(householdId.extend({ userId: z.uuid() }))
      .mutation(async ({ ctx, input }) => {
        const { data, error } = await ctx.supabase
          .from("household_members").delete()
          .eq("household_id", input.householdId).eq("user_id", input.userId)
          .select();
        if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
        if (!data || data.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
        return { removed: true };
      }),
  }),

  leave: protectedProcedure.input(householdId).mutation(async ({ ctx, input }) => {
    // Atomic in the database: leave_household() deletes the household when the
    // caller is the last member, and refuses a sole owner with members left.
    const { error } = await ctx.supabase.rpc("leave_household", {
      p_household_id: input.householdId,
    });
    if (error) {
      if (error.message.includes("owner_must_remove_members_first")) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "owner_must_remove_members_first" });
      }
      if (error.message.includes("not_a_member")) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    }
    return { left: true };
  }),
});
