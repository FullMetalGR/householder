"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { ShoppingBasket, ShoppingCart } from "lucide-react";
import { useTRPC } from "@/lib/trpc/client";
import { useActiveHousehold } from "@/lib/active-household";
import { useHouseholdRealtime } from "@/lib/use-household-realtime";
import { HouseholdSwitcher } from "@/components/lists/household-switcher";
import { ListCard } from "@/components/lists/list-card";
import { NewListDialog } from "@/components/lists/new-list-dialog";
import { PushNudge } from "@/components/push-nudge";
import { Card, CardContent } from "@/components/ui/card";

export default function ListsPage() {
  const t = useTranslations("home");
  const trpc = useTRPC();
  const router = useRouter();
  const { householdId, memberships, isLoading, isError } = useActiveHousehold();
  useHouseholdRealtime(householdId);

  useEffect(() => {
    // Only a confirmed-empty membership list means onboarding; a failed fetch
    // must not bounce a real member off their home screen.
    if (!isLoading && !isError && memberships.length === 0) router.replace("/onboarding");
  }, [isLoading, isError, memberships.length, router]);

  const active = useQuery({
    ...trpc.list.getActive.queryOptions({ householdId: householdId! }),
    enabled: !!householdId,
  });

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <HouseholdSwitcher />
      </div>

      {active.data?.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <ShoppingBasket size={40} />
          <p className="font-medium">{t("empty")}</p>
          <p className="text-sm">{t("emptyHint")}</p>
        </div>
      )}

      {active.data?.map((list) => (
        <ListCard key={list.id} list={list} />
      ))}

      <Card className="border-dashed bg-transparent">
        <CardContent className="flex items-center gap-3 p-4 text-muted-foreground">
          <ShoppingCart size={20} />
          <div className="flex flex-col">
            <span className="text-sm font-medium">{t("orderingSoon")}</span>
            <span className="text-xs">{t("orderingSoonHint")}</span>
          </div>
        </CardContent>
      </Card>

      {householdId && (
        <>
          <NewListDialog householdId={householdId} />
          <PushNudge hasLists={(active.data?.length ?? 0) > 0} />
        </>
      )}
    </div>
  );
}
