import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";

const listId = z.object({ listId: z.uuid() });
const HISTORY_PAGE_SIZE = 20;

function mapRpcError(error: { message: string }): TRPCError {
  if (error.message.includes("not_found")) return new TRPCError({ code: "NOT_FOUND" });
  if (error.message.includes("list_completed"))
    return new TRPCError({ code: "BAD_REQUEST", message: "list_completed" });
  if (error.message.includes("empty_list"))
    return new TRPCError({ code: "BAD_REQUEST", message: "empty_list" });
  if (error.message.includes("not_completed"))
    return new TRPCError({ code: "BAD_REQUEST", message: "not_completed" });
  return new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
}

export const listRouter = router({
  create: protectedProcedure
    .input(z.object({ householdId: z.uuid(), name: z.string().trim().min(1).max(80) }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("lists")
        .insert({ household_id: input.householdId, name: input.name, created_by: ctx.user.id })
        .select()
        .single();
      if (error) {
        // RLS with-check failure for non-members surfaces as 42501
        if (error.code === "42501") throw new TRPCError({ code: "NOT_FOUND" });
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      }
      return data;
    }),

  rename: protectedProcedure
    .input(listId.extend({ name: z.string().trim().min(1).max(80) }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("lists").update({ name: input.name })
        .eq("id", input.listId).eq("status", "active")
        .select().maybeSingle();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      if (!data) {
        const { data: existing } = await ctx.supabase
          .from("lists").select("status").eq("id", input.listId).maybeSingle();
        if (existing?.status === "completed")
          throw new TRPCError({ code: "BAD_REQUEST", message: "list_completed" });
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return data;
    }),

  delete: protectedProcedure.input(listId).mutation(async ({ ctx, input }) => {
    const { data, error } = await ctx.supabase
      .from("lists").delete().eq("id", input.listId).select();
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    if (!data || data.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
    return { deleted: true };
  }),

  get: protectedProcedure.input(listId).query(async ({ ctx, input }) => {
    const { data, error } = await ctx.supabase
      .from("lists")
      .select("*, list_items(*)")
      .eq("id", input.listId)
      .maybeSingle();
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    if (!data) throw new TRPCError({ code: "NOT_FOUND" });
    const { list_items: items, ...list } = data;
    items.sort(
      (a, b) =>
        Number(a.checked) - Number(b.checked) ||
        Number(a.position) - Number(b.position) ||
        a.created_at.localeCompare(b.created_at)
    );
    return { ...list, items };
  }),

  getActive: protectedProcedure
    .input(z.object({ householdId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from("lists")
        .select("id, name, created_at, list_items(checked, created_at, checked_at)")
        .eq("household_id", input.householdId)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data.map(({ list_items, ...list }) => {
        const timestamps = [
          list.created_at,
          ...list_items.map((i) => i.created_at),
          ...list_items.flatMap((i) => (i.checked_at ? [i.checked_at] : [])),
        ];
        return {
          ...list,
          total: list_items.length,
          checkedCount: list_items.filter((i) => i.checked).length,
          lastActivity: timestamps.reduce((a, b) => (a > b ? a : b)),
        };
      });
    }),

  getHistory: protectedProcedure
    .input(z.object({ householdId: z.uuid(), cursor: z.string().nullish() }))
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from("lists")
        .select(
          "id, name, completed_at, completed_by, completed_by_profile:profiles!lists_completed_by_fkey(display_name, avatar_url), list_items(count)"
        )
        .eq("household_id", input.householdId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(HISTORY_PAGE_SIZE);
      if (input.cursor) query = query.lt("completed_at", input.cursor);
      const { data, error } = await query;
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      const trips = (data as Array<{
        id: string;
        name: string;
        completed_at: string | null;
        completed_by: string | null;
        completed_by_profile: { display_name: string; avatar_url: string | null } | null;
        list_items: Array<{ count: number }>;
      }>).map(({ list_items, ...trip }) => ({
        ...trip,
        itemCount: list_items[0]?.count ?? 0,
      }));
      return {
        trips,
        // completed_at is never null here: complete_list() always sets it for
        // status='completed', an invariant the RPC maintains, not a constraint.
        nextCursor:
          data.length === HISTORY_PAGE_SIZE ? trips[trips.length - 1].completed_at : null,
      };
    }),

  complete: protectedProcedure
    .input(listId.extend({ carryOver: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("complete_list", {
        p_list_id: input.listId,
        p_carry_over: input.carryOver,
      });
      if (error) throw mapRpcError(error);
      const result = data as { completed_list_id: string; carry_list_id: string | null };
      return { completedListId: result.completed_list_id, carryListId: result.carry_list_id };
    }),

  reorderFrom: protectedProcedure.input(listId).mutation(async ({ ctx, input }) => {
    const { data, error } = await ctx.supabase.rpc("reorder_from", { p_list_id: input.listId });
    if (error) throw mapRpcError(error);
    return { newListId: data };
  }),
});
