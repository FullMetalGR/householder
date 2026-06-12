import { router, protectedProcedure } from "@/server/trpc";
import { profileRouter } from "./profile";
import { householdRouter } from "./household";
import { inviteRouter } from "./invite";
import { listRouter } from "./list";
import { itemRouter } from "./item";

export const appRouter = router({
  health: router({
    ping: protectedProcedure.query(() => ({ ok: true })),
  }),
  profile: profileRouter,
  household: householdRouter,
  invite: inviteRouter,
  list: listRouter,
  item: itemRouter,
});

export type AppRouter = typeof appRouter;
