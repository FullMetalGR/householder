import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import type { Context } from "@/server/context";
import type { TablesUpdate } from "@/lib/supabase/database.types";

const nameField = z.string().trim().min(1).max(120);
const qtyField = z.string().trim().max(40).nullish();
const noteField = z.string().trim().max(280).nullish();
const itemId = z.object({ itemId: z.uuid() });

async function requireActiveList(supabase: Context["supabase"], listId: string) {
  const { data, error } = await supabase
    .from("lists").select("id, household_id, status").eq("id", listId).maybeSingle();
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  if (!data) throw new TRPCError({ code: "NOT_FOUND" });
  if (data.status !== "active")
    throw new TRPCError({ code: "BAD_REQUEST", message: "list_completed" });
  return data;
}

async function requireItemOnActiveList(supabase: Context["supabase"], id: string) {
  const { data, error } = await supabase
    .from("list_items")
    .select("id, list:lists!inner(status)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
  if (!data) throw new TRPCError({ code: "NOT_FOUND" });
  const list = data.list as { status: string } | null;
  if (list?.status !== "active")
    throw new TRPCError({ code: "BAD_REQUEST", message: "list_completed" });
}

export const itemRouter = router({
  add: protectedProcedure
    .input(z.object({ listId: z.uuid(), name: nameField, qty: qtyField, note: noteField }))
    .mutation(async ({ ctx, input }) => {
      const list = await requireActiveList(ctx.supabase, input.listId);
      const { data: top } = await ctx.supabase
        .from("list_items").select("position")
        .eq("list_id", input.listId)
        .order("position", { ascending: false })
        .limit(1).maybeSingle();
      const { data, error } = await ctx.supabase
        .from("list_items")
        .insert({
          list_id: input.listId,
          household_id: list.household_id,
          name: input.name,
          qty: input.qty ?? null,
          note: input.note ?? null,
          added_by: ctx.user.id,
          position: Number(top?.position ?? 0) + 1,
        })
        .select()
        .single();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data;
    }),

  setChecked: protectedProcedure
    .input(z.object({ itemId: z.uuid(), checked: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await requireItemOnActiveList(ctx.supabase, input.itemId);
      const patch = input.checked
        ? { checked: true, checked_by: ctx.user.id, checked_at: new Date().toISOString() }
        : { checked: false, checked_by: null, checked_at: null };
      const { data, error } = await ctx.supabase
        .from("list_items").update(patch).eq("id", input.itemId).select().maybeSingle();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      if (!data) throw new TRPCError({ code: "NOT_FOUND" });
      return data;
    }),

  update: protectedProcedure
    .input(itemId.extend({ name: nameField.optional(), qty: qtyField, note: noteField }))
    .mutation(async ({ ctx, input }) => {
      await requireItemOnActiveList(ctx.supabase, input.itemId);
      const patch: TablesUpdate<"list_items"> = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.qty !== undefined) patch.qty = input.qty;
      if (input.note !== undefined) patch.note = input.note;
      if (Object.keys(patch).length === 0)
        throw new TRPCError({ code: "BAD_REQUEST", message: "empty_update" });
      const { data, error } = await ctx.supabase
        .from("list_items").update(patch).eq("id", input.itemId).select().maybeSingle();
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      if (!data) throw new TRPCError({ code: "NOT_FOUND" });
      return data;
    }),

  remove: protectedProcedure.input(itemId).mutation(async ({ ctx, input }) => {
    await requireItemOnActiveList(ctx.supabase, input.itemId);
    const { data, error } = await ctx.supabase
      .from("list_items").delete().eq("id", input.itemId).select();
    if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
    if (!data || data.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
    return { removed: true };
  }),

  suggest: protectedProcedure
    .input(z.object({ listId: z.uuid(), prefix: z.string().max(120).default("") }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase.rpc("suggest_items", {
        p_list_id: input.listId,
        p_prefix: input.prefix,
      });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return data.map((row) => row.name);
    }),
});
