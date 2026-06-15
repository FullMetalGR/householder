"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export type ListItem = {
  id: string;
  name: string;
  qty: string | null;
  note: string | null;
  checked: boolean;
  added_by: string | null;
};

export type MemberInfo = { displayName: string; avatarUrl: string | null; color: string };

export function ItemRow({
  item,
  member,
  onToggle,
  onOpen,
  disabled,
}: {
  item: ListItem;
  member: MemberInfo | undefined;
  onToggle: (checked: boolean) => void;
  onOpen: () => void;
  disabled?: boolean;
}) {
  const subtitle = [item.qty, item.note].filter(Boolean).join(" · ");
  return (
    <div className="flex items-center gap-3 py-1">
      <button
        type="button"
        aria-pressed={item.checked}
        aria-label={item.name}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onToggle(!item.checked);
        }}
        className="shrink-0 p-2 text-primary"
      >
        {item.checked ? <CheckCircle2 size={24} /> : <Circle size={24} className="text-muted-foreground" />}
      </button>
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 flex-col items-start py-2 text-left">
        <span className={cn("truncate", item.checked && "text-muted-foreground line-through")}>
          {item.name}
        </span>
        {subtitle && <span className="truncate text-xs text-muted-foreground">{subtitle}</span>}
      </button>
      {member && (
        <Avatar className="size-7 shrink-0">
          <AvatarImage src={member.avatarUrl ?? undefined} />
          <AvatarFallback style={{ backgroundColor: member.color }} className="text-xs text-white">
            {member.displayName[0] ?? "?"}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}
