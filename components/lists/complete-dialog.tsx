"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export function CompleteDialog({
  open,
  uncheckedCount,
  pending,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  uncheckedCount: number;
  pending: boolean;
  onConfirm: (carryOver: boolean) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("list");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("completeTitle")}</DialogTitle>
          <DialogDescription>{t("completeDesc", { count: uncheckedCount })}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button disabled={pending} onClick={() => onConfirm(true)}>
            {t("carryOver")}
          </Button>
          <Button variant="outline" disabled={pending} onClick={() => onConfirm(false)}>
            {t("completeAnyway")}
          </Button>
          <Button variant="ghost" onClick={onCancel}>{t("cancel")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
