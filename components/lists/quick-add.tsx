"use client";

import { useDeferredValue, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function QuickAdd({ listId, onAdd }: { listId: string; onAdd: (name: string) => void }) {
  const t = useTranslations("list");
  const trpc = useTRPC();
  const [value, setValue] = useState("");
  const deferred = useDeferredValue(value);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useQuery({
    ...trpc.item.suggest.queryOptions({ listId, prefix: deferred.trim() }),
    placeholderData: keepPreviousData,
  });

  function submit(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setValue("");
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
              onClick={() => submit(name)}
              className="shrink-0 rounded-full border bg-card px-3 py-1 text-sm"
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(value);
        }}
      >
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("addPlaceholder")}
          autoComplete="off"
          enterKeyHint="done"
        />
        <Button type="submit" size="icon" aria-label={t("addPlaceholder")} disabled={!value.trim()}>
          <Plus size={20} />
        </Button>
      </form>
    </div>
  );
}
