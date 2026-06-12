"use client";

import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { History, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import { useActiveHousehold } from "@/lib/active-household";
import { useHouseholdRealtime } from "@/lib/use-household-realtime";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function HistoryPage() {
  const t = useTranslations("history");
  const tt = useTranslations("tabs");
  const te = useTranslations("errors");
  const format = useFormatter();
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();
  const { householdId } = useActiveHousehold();
  useHouseholdRealtime(householdId);

  const history = useInfiniteQuery({
    ...trpc.list.getHistory.infiniteQueryOptions(
      { householdId: householdId! },
      { getNextPageParam: (last) => last.nextCursor }
    ),
    enabled: !!householdId,
  });

  const reorder = useMutation(
    trpc.list.reorderFrom.mutationOptions({
      onSuccess: ({ newListId }) => {
        qc.invalidateQueries(trpc.list.pathFilter());
        router.push(`/lists/${newListId}`);
      },
      onError: () => toast.error(te("generic")),
    })
  );

  const trips = history.data?.pages.flatMap((p) => p.trips) ?? [];

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">{tt("history")}</h1>

      {history.isError && (
        <p className="py-16 text-center text-sm text-muted-foreground">{te("generic")}</p>
      )}

      {history.isSuccess && trips.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <History size={40} />
          <p className="font-medium">{t("empty")}</p>
        </div>
      )}

      {trips.map((trip) => (
        <Card key={trip.id}>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{trip.name}</p>
              <p className="text-xs text-muted-foreground">
                {trip.completed_at
                  ? `${format.dateTime(new Date(trip.completed_at), { dateStyle: "medium" })} · `
                  : null}
                {t("items", { count: trip.itemCount })}
                {trip.completed_by_profile?.display_name
                  ? ` · ${t("by", { name: trip.completed_by_profile.display_name })}`
                  : null}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={reorder.isPending}
              onClick={() => reorder.mutate({ listId: trip.id })}
            >
              <RotateCcw size={14} /> {t("again")}
            </Button>
          </CardContent>
        </Card>
      ))}

      {history.hasNextPage && (
        <Button
          variant="ghost"
          disabled={history.isFetchingNextPage}
          onClick={() => history.fetchNextPage()}
        >
          {t("more")}
        </Button>
      )}
    </div>
  );
}
