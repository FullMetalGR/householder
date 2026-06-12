"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import { useActiveHousehold } from "@/lib/active-household";
import { useHouseholdRealtime } from "@/lib/use-household-realtime";
import { Button } from "@/components/ui/button";
import { ItemRow, type MemberInfo, type ListItem } from "@/components/lists/item-row";
import { QuickAdd } from "@/components/lists/quick-add";
import { ItemSheet } from "@/components/lists/item-sheet";
import { CompleteDialog } from "@/components/lists/complete-dialog";
import { ListMenu } from "@/components/lists/list-menu";

const MEMBER_COLORS = ["#7c3aed", "#d97706", "#0d9488", "#0284c7"];

export default function ListDetailPage() {
  const { listId } = useParams<{ listId: string }>();
  const t = useTranslations("list");
  const te = useTranslations("errors");
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();
  const { householdId, setActive } = useActiveHousehold();

  const list = useQuery({
    ...trpc.list.get.queryOptions({ listId }),
    retry: (failureCount, error) =>
      (error as { data?: { code?: string } }).data?.code !== "NOT_FOUND" && failureCount < 2,
  });
  useHouseholdRealtime(list.data?.household_id);

  // A push link can target another of the user's households: follow it.
  // Overwriting the stored household here is the designed behavior, not an accident.
  useEffect(() => {
    if (list.data && householdId && list.data.household_id !== householdId) {
      setActive(list.data.household_id);
    }
  }, [list.data, householdId, setActive]);

  const members = useQuery({
    ...trpc.household.members.list.queryOptions({ householdId: list.data?.household_id ?? "" }),
    enabled: !!list.data,
  });

  const memberInfo = useMemo(() => {
    const map = new Map<string, MemberInfo>();
    members.data?.forEach((m, index) => {
      map.set(m.user_id, {
        displayName: m.profile?.display_name ?? "?",
        avatarUrl: m.profile?.avatar_url ?? null,
        color: MEMBER_COLORS[index % MEMBER_COLORS.length],
      });
    });
    return map;
  }, [members.data]);

  const getKey = trpc.list.get.queryKey({ listId });
  type ListDetail = NonNullable<typeof list.data>;

  function sortItems(items: ListDetail["items"]) {
    return [...items].sort(
      (a, b) =>
        Number(a.checked) - Number(b.checked) ||
        Number(a.position) - Number(b.position) ||
        a.created_at.localeCompare(b.created_at)
    );
  }

  const items = list.data?.items ?? [];
  const checkedCount = items.filter((i) => i.checked).length;

  const [selectedItem, setSelectedItem] = useState<ListItem | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);

  const setChecked = useMutation(
    trpc.item.setChecked.mutationOptions({
      onMutate: async (input) => {
        await qc.cancelQueries({ queryKey: getKey });
        const previous = qc.getQueryData<ListDetail>(getKey);
        if (previous) {
          qc.setQueryData<ListDetail>(getKey, {
            ...previous,
            items: sortItems(
              previous.items.map((i) =>
                i.id === input.itemId ? { ...i, checked: input.checked } : i
              )
            ),
          });
        }
        return { previous };
      },
      onError: (_err, _input, context) => {
        if (context?.previous) qc.setQueryData(getKey, context.previous);
        toast.error(te("generic"));
      },
      onSettled: () => qc.invalidateQueries({ queryKey: getKey }),
    })
  );

  const addItem = useMutation(
    trpc.item.add.mutationOptions({
      onMutate: async (input) => {
        await qc.cancelQueries({ queryKey: getKey });
        const previous = qc.getQueryData<ListDetail>(getKey);
        if (previous) {
          const maxPosition = previous.items.reduce((m, i) => Math.max(m, Number(i.position)), 0);
          const optimistic: ListDetail["items"][number] = {
            id: crypto.randomUUID(),
            list_id: listId,
            household_id: previous.household_id,
            name: input.name,
            qty: input.qty ?? null,
            note: input.note ?? null,
            added_by: null,
            checked: false,
            checked_by: null,
            checked_at: null,
            position: maxPosition + 1,
            created_at: new Date().toISOString(),
          };
          qc.setQueryData<ListDetail>(getKey, {
            ...previous,
            items: sortItems([...previous.items, optimistic]),
          });
        }
        return { previous };
      },
      onError: (_err, _input, context) => {
        if (context?.previous) qc.setQueryData(getKey, context.previous);
        toast.error(te("generic"));
      },
      onSettled: () => {
        qc.invalidateQueries({ queryKey: getKey });
        qc.invalidateQueries(trpc.item.suggest.pathFilter());
      },
    })
  );

  const complete = useMutation(
    trpc.list.complete.mutationOptions({
      onSuccess: ({ carryListId }) => {
        toast.success(t("completed"));
        qc.invalidateQueries(trpc.list.pathFilter());
        if (carryListId) router.replace(`/lists/${carryListId}`);
        else router.replace("/lists");
      },
      onError: () => {
        toast.error(te("generic"));
        qc.invalidateQueries(trpc.list.pathFilter());
      },
      onSettled: () => setCompleteOpen(false),
    })
  );

  // Completed lists live in History, not here. Gated on the complete mutation
  // so this never races the carry-over navigation: when the user completes
  // with carry-over, onSuccess must win and land on the new list, while the
  // invalidation refetch flips this list to completed underneath us.
  useEffect(() => {
    if (list.data?.status === "completed" && !complete.isPending && !complete.isSuccess) {
      router.replace("/history");
    }
  }, [list.data?.status, complete.isPending, complete.isSuccess, router]);

  const uncheckedCount = items.length - checkedCount;

  function onDone() {
    if (uncheckedCount === 0) complete.mutate({ listId, carryOver: false });
    else setCompleteOpen(true);
  }

  if (list.isError) {
    const isNotFound = (list.error as { data?: { code?: string } } | null)?.data?.code === "NOT_FOUND";
    return (
      <div className="flex flex-col items-center gap-4 p-10 text-center">
        <PackageOpen size={40} className="text-muted-foreground" />
        <p className="text-muted-foreground">{isNotFound ? t("notFound") : te("generic")}</p>
        <Button asChild variant="outline">
          <Link href="/lists">{t("backToLists")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col p-4 pb-44">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t("backToLists")}>
          <Link href="/lists"><ChevronLeft size={22} /></Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold">{list.data?.name}</h1>
          <p className="text-xs text-muted-foreground">
            {t("inBasket", { checked: checkedCount, total: items.length })}
          </p>
        </div>
        <Button size="sm" onClick={onDone} disabled={items.length === 0 || complete.isPending}>
          {t("done")}
        </Button>
        {list.data && <ListMenu listId={listId} currentName={list.data.name} />}
      </div>

      {items.length === 0 && list.data && (
        <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
          <PackageOpen size={36} />
          <p className="font-medium">{t("empty")}</p>
          <p className="text-sm">{t("emptyHint")}</p>
        </div>
      )}

      <div className="mt-2 flex flex-col">
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            member={item.added_by ? memberInfo.get(item.added_by) : undefined}
            onToggle={(checked) => setChecked.mutate({ itemId: item.id, checked })}
            onOpen={() => setSelectedItem(item)}
          />
        ))}
      </div>

      <QuickAdd listId={listId} onAdd={(name) => addItem.mutate({ listId, name })} />

      <ItemSheet item={selectedItem} onClose={() => setSelectedItem(null)} />
      <CompleteDialog
        open={completeOpen}
        uncheckedCount={uncheckedCount}
        pending={complete.isPending}
        onConfirm={(carryOver) => complete.mutate({ listId, carryOver })}
        onCancel={() => setCompleteOpen(false)}
      />
    </div>
  );
}
