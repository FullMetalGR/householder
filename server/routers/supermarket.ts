import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";
import { getProvider, providers } from "@/lib/supermarket/registry";

export const supermarketRouter = router({
  providers: router({
    list: protectedProcedure.query(() => providers.map((p) => ({ id: p.id }))),
  }),

  createOrder: protectedProcedure
    .input(z.object({ listId: z.uuid(), providerId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const provider = getProvider(input.providerId);
      if (!provider) throw new TRPCError({ code: "BAD_REQUEST", message: "no_provider" });
      // Deliberate v1 reading: every item on the list goes into the order,
      // checked or not. Revisit (filter checked, or let the user pick) when
      // the first real provider adapter lands.
      const { data, error } = await ctx.supabase
        .from("list_items")
        .select("name, qty, note")
        .eq("list_id", input.listId)
        .order("position");
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      if (!data || data.length === 0) throw new TRPCError({ code: "NOT_FOUND" });
      const order = await provider.createOrder(data);
      return { orderId: order.id, status: order.status };
    }),
});
