"use client";

import { useDeferredValue, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus, SlidersHorizontal } from "lucide-react";
import { useTRPC } from "@/lib/trpc/client";
import { useOnline } from "@/lib/use-online";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type QuickAddInput = { name: string; qty?: string; note?: string };

export function QuickAdd({ listId, onAdd }: { listId: string; onAdd: (input: QuickAddInput) => void }) {
  const t = useTranslations("list");
  const trpc = useTRPC();
  const online = useOnline();
  const [value, setValue] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const deferred = useDeferredValue(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useQuery({
    ...trpc.item.suggest.queryOptions({ listId, prefix: deferred.trim() }),
    placeholderData: keepPreviousData,
  });

  function submit(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd({
      name: trimmed,
      qty: qty.trim() || undefined,
      note: note.trim() || undefined,
    });
    setValue("");
    setQty("");
    setNote("");
    setExpanded(false);
    inputRef.current?.focus();
  }

  return (
    <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] mx-auto flex max-w-md flex-col gap-2 border-t bg-background p-3 pb-4">
      {(suggestions.data?.length ?? 0) > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {suggestions.data!.map((name) => (
            <button
              key={name}
              type="button"
              disabled={!online}
              onClick={() => submit(name)}
              className="shrink-0 rounded-full border bg-card px-3 py-1 text-sm"
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
      >
        {expanded && (
          <div className="flex gap-2">
            <Input
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={t("qty")}
              autoComplete="off"
              maxLength={40}
              disabled={!online}
              className="w-28"
            />
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("note")}
              autoComplete="off"
              maxLength={280}
              disabled={!online}
              className="flex-1"
            />
          </div>
        )}
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t("addPlaceholder")}
            autoComplete="off"
            enterKeyHint="done"
            disabled={!online}
          />
          <Button
            type="button"
            size="icon"
            variant={expanded ? "secondary" : "outline"}
            aria-label={t("addDetails")}
            aria-expanded={expanded}
            disabled={!online}
            onClick={() => setExpanded((v) => !v)}
          >
            <SlidersHorizontal size={20} />
          </Button>
          <Button type="submit" size="icon" aria-label={t("addPlaceholder")} disabled={!value.trim() || !online}>
            <Plus size={20} />
          </Button>
        </div>
      </form>
    </div>
  );
}
