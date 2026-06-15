"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EllipsisVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import { useOnline } from "@/lib/use-online";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function ListMenu({ listId, currentName }: { listId: string; currentName: string }) {
  const t = useTranslations("list");
  const te = useTranslations("errors");
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();
  const online = useOnline();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState(currentName);

  const rename = useMutation(
    trpc.list.rename.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries(trpc.list.pathFilter());
        setRenameOpen(false);
      },
      onError: () => toast.error(te("generic")),
    })
  );
  const deleteList = useMutation(
    trpc.list.delete.mutationOptions({
      onSuccess: () => {
        qc.invalidateQueries(trpc.list.pathFilter());
        router.replace("/lists");
      },
      onError: () => toast.error(te("generic")),
    })
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("options")}>
            <EllipsisVertical size={20} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => { setName(currentName); setRenameOpen(true); }}>
            <Pencil size={16} /> {t("renameList")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setDeleteOpen(true)}>
            <Trash2 size={16} /> {t("deleteList")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{t("renameList")}</DialogTitle></DialogHeader>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>{t("cancel")}</Button>
            <Button
              disabled={!name.trim() || rename.isPending || !online}
              onClick={() => rename.mutate({ listId, name: name.trim() })}
            >
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{t("deleteListConfirm")}</DialogTitle></DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>{t("cancel")}</Button>
            <Button
              variant="destructive"
              disabled={deleteList.isPending || !online}
              onClick={() => deleteList.mutate({ listId })}
            >
              {t("deleteList")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
