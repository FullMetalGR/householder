"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimePostgresDeletePayload } from "@supabase/supabase-js";
import { useTRPC } from "@/lib/trpc/client";
import { supabaseBrowser } from "@/lib/supabase/browser";

// One subscription per open household: INSERT/UPDATE on lists and list_items
// are household-filtered and RLS-authorized; DELETE events arrive unfiltered
// with only the old primary key (replica identity DEFAULT), so they are
// treated as untrusted hints: ignored unless the id is already in our cache.
export function useHouseholdRealtime(householdId: string | undefined) {
  const trpc = useTRPC();
  const qc = useQueryClient();

  useEffect(() => {
    if (!householdId) return;
    const supabase = supabaseBrowser();

    const invalidate = () => {
      qc.invalidateQueries(trpc.list.pathFilter());
      qc.invalidateQueries(trpc.item.pathFilter());
    };

    const cacheHasId = (id: string) =>
      [
        ...qc.getQueriesData(trpc.list.pathFilter()),
        ...qc.getQueriesData(trpc.item.pathFilter()),
      ].some(([, data]) => data !== undefined && JSON.stringify(data).includes(id));

    const onDelete = (payload: RealtimePostgresDeletePayload<{ id: string }>) => {
      const id = payload.old?.id;
      if (typeof id === "string" && cacheHasId(id)) invalidate();
    };

    const filter = `household_id=eq.${householdId}`;
    const channel = supabase
      .channel(`household-${householdId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lists", filter }, invalidate)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "lists", filter }, invalidate)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "list_items", filter }, invalidate)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "list_items", filter }, invalidate)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "lists" }, onDelete)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "list_items" }, onDelete)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [householdId, qc, trpc]);
}
