"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { isIOS, isStandalone, pushSupported, subscribeDevice } from "@/lib/push";

const FLAG = "hh.pushNudged";

export function PushNudge({ hasLists }: { hasLists: boolean }) {
  const t = useTranslations("settings");
  const trpc = useTRPC();
  const subscribe = useMutation(trpc.push.subscribe.mutationOptions());
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hasLists) return;
    if (localStorage.getItem(FLAG)) return;
    // No VAPID key in this build: never nudge toward a flow that cannot work.
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;
    if (!pushSupported() || Notification.permission !== "default") return;
    if (isIOS() && !isStandalone()) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true);
  }, [hasLists]);

  function dismiss() {
    localStorage.setItem(FLAG, "1");
    setOpen(false);
  }

  async function enable() {
    localStorage.setItem(FLAG, "1");
    setOpen(false);
    try {
      const device = await subscribeDevice();
      await subscribe.mutateAsync(device);
    } catch (e) {
      if (e instanceof Error && e.message === "permission-denied") {
        toast.error(t("pushDenied"));
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && dismiss()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("pushNudgeTitle")}</DialogTitle>
          <DialogDescription>{t("pushNudgeDesc")}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={dismiss}>{t("later")}</Button>
          <Button onClick={enable}>{t("enableNotifications")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
