"use client";

import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveHousehold } from "@/lib/active-household";

export function HouseholdSwitcher() {
  const { household, memberships, setActive } = useActiveHousehold();
  if (!household) return null;
  if (memberships.length === 1) {
    return <h1 className="truncate text-xl font-bold">{household.name}</h1>;
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-1 px-2 text-xl font-bold">
          <span className="truncate">{household.name}</span>
          <ChevronDown size={18} className="shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {memberships.map((m) => (
          <DropdownMenuItem key={m.household.id} onClick={() => setActive(m.household.id)}>
            <span className="flex-1">{m.household.name}</span>
            {m.household.id === household.id && <Check size={16} />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
