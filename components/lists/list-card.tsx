"use client";

import Link from "next/link";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";

type ListSummary = {
  id: string;
  name: string;
  total: number;
  checkedCount: number;
  lastActivity: string;
};

export function ListCard({ list }: { list: ListSummary }) {
  const t = useTranslations("home");
  const format = useFormatter();
  const now = useNow();
  const progress = list.total === 0 ? 0 : Math.round((list.checkedCount / list.total) * 100);
  return (
    <Link href={`/lists/${list.id}`}>
      <Card className="transition-colors active:bg-accent/40">
        <CardContent className="flex flex-col gap-2 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate font-semibold">{list.name}</span>
            <span className="shrink-0 text-sm text-muted-foreground">
              {t("counts", { checked: list.checkedCount, total: list.total })}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
          </div>
          <span className="text-xs text-muted-foreground">
            {format.relativeTime(new Date(list.lastActivity), now)}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
