"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import type { ListItem } from "@/components/lists/item-row";

export function ItemSheet({
  item,
  onClose,
}: {
  item: ListItem | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="rounded-t-xl" aria-describedby={undefined}>
        {item && <ItemSheetBody key={item.id} item={item} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

function ItemSheetBody({ item, onClose }: { item: ListItem; onClose: () => void }) {
  const t = useTranslations("list");
  const te = useTranslations("errors");
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [name, setName] = useState(item.name);
  const [qty, setQty] = useState(item.qty ?? "");
  const [note, setNote] = useState(item.note ?? "");

  const update = useMutation(
    trpc.item.update.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries(trpc.list.pathFilter());
        onClose();
      },
      onError: () => toast.error(te("generic")),
    })
  );
  const remove = useMutation(
    trpc.item.remove.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries(trpc.list.pathFilter());
        onClose();
      },
      onError: () => toast.error(te("generic")),
    })
  );

  return (
    <div className="flex flex-col gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <SheetHeader className="p-0">
        <SheetTitle className="truncate">{item.name}</SheetTitle>
      </SheetHeader>
      <label className="text-xs text-muted-foreground" htmlFor="item-name">{t("name")}</label>
      <Input id="item-name" value={name} onChange={(e) => setName(e.target.value)} />
      <label className="text-xs text-muted-foreground" htmlFor="item-qty">{t("qty")}</label>
      <Input id="item-qty" value={qty} onChange={(e) => setQty(e.target.value)} />
      <label className="text-xs text-muted-foreground" htmlFor="item-note">{t("note")}</label>
      <Input id="item-note" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="mt-2 flex items-center justify-between">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="icon" aria-label={t("delete")}>
              <Trash2 size={16} />
            </Button>
          </DialogTrigger>
          <DialogContent aria-describedby={undefined}>
            <DialogHeader><DialogTitle>{t("deleteConfirm")}</DialogTitle></DialogHeader>
            <DialogFooter>
              <Button
                variant="destructive"
                disabled={remove.isPending}
                onClick={() => remove.mutate({ itemId: item.id })}
              >
                {t("delete")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Button
          disabled={!name.trim() || update.isPending}
          onClick={() =>
            update.mutate({
              itemId: item.id,
              name: name.trim(),
              qty: qty.trim() === "" ? null : qty.trim(),
              note: note.trim() === "" ? null : note.trim(),
            })
          }
        >
          {t("save")}
        </Button>
      </div>
    </div>
  );
}
