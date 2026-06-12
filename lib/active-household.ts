"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

const STORAGE_KEY = "hh.activeHousehold";

export function useActiveHousehold() {
  const trpc = useTRPC();
  const mine = useQuery(trpc.household.listMine.queryOptions());
  const [stored, setStored] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStored(localStorage.getItem(STORAGE_KEY));
  }, []);

  const memberships = mine.data ?? [];
  const isStoredValid = memberships.some((m) => m.household.id === stored);
  // listMine is ordered by joined_at ascending, so [0] is the earliest membership
  const householdId = isStoredValid ? stored! : memberships[0]?.household.id;
  const household = memberships.find((m) => m.household.id === householdId)?.household;

  const setActive = useCallback((id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    setStored(id);
  }, []);

  return {
    householdId,
    household,
    memberships,
    setActive,
    isLoading: mine.isLoading,
    isError: mine.isError,
  };
}
