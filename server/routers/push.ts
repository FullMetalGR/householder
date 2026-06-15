import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc";

export const pushRouter = router({
  subscribe: protectedProcedure
    .input(
      z.object({
        endpoint: z.url().max(1000),
        // Bounds are abuse ceilings, not key-shape validators: real p256dh is
        // 87-88 base64url chars and auth 22-24, but the push service is the
        // authority on validity and tests stub shorter values.
        keys: z.object({ p256dh: z.string().min(1).max(300), auth: z.string().min(1).max(100) }),
        userAgent: z.string().max(400).nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.rpc("claim_push_subscription", {
        p_endpoint: input.endpoint,
        p_p256dh: input.keys.p256dh,
        p_auth: input.keys.auth,
        p_user_agent: input.userAgent ?? "",
      });
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { subscribed: true };
    }),

  unsubscribe: protectedProcedure
    .input(z.object({ endpoint: z.string().min(1).max(1000) }))
    .mutation(async ({ ctx, input }) => {
      // RLS scopes the delete to the caller's own rows; a foreign endpoint
      // simply matches nothing.
      const { error } = await ctx.supabase
        .from("push_subscriptions")
        .delete()
        .eq("endpoint", input.endpoint);
      if (error) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: error.message });
      return { unsubscribed: true };
    }),
});
