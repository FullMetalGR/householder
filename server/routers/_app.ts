import { router, protectedProcedure } from "@/server/trpc";
import { profileRouter } from "./profile";
import { householdRouter } from "./household";
import { inviteRouter } from "./invite";

export const appRouter = router({
  health: router({
    ping: protectedProcedure.query(() => ({ ok: true })),
  }),
  profile: profileRouter,
  household: householdRouter,
  invite: inviteRouter,
});

export type AppRouter = typeof appRouter;
