"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTRPC } from "@/lib/trpc/client";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  getCurrentSubscription,
  isIOS,
  isStandalone,
  pushSupported,
  subscribeDevice,
  unsubscribeDevice,
} from "@/lib/push";

type State = "loading" | "unsupported" | "install-first" | "off" | "on";

export function NotificationsCard() {
  const t = useTranslations("settings");
  const trpc = useTRPC();
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);

  const subscribe = useMutation(trpc.push.subscribe.mutationOptions());
  const unsubscribe = useMutation(trpc.push.unsubscribe.mutationOptions());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // A build without the VAPID key must read as unsupported, not prompt
      // for OS permission and then fail with a generic error.
      if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return setState("unsupported");
      if (!pushSupported()) {
        // iPhone Safari exposes the push APIs only once the app is installed
        // from Safari, so the guidance state takes priority over unsupported.
        return setState(isIOS() && !isStandalone() ? "install-first" : "unsupported");
      }
      if (isIOS() && !isStandalone()) return setState("install-first");
      const sub = await getCurrentSubscription();
      if (!cancelled) setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(next: boolean) {
    setBusy(true);
    try {
      if (next) {
        const device = await subscribeDevice();
        await subscribe.mutateAsync(device);
        setState("on");
      } else {
        const endpoint = await unsubscribeDevice();
        if (endpoint) await unsubscribe.mutateAsync({ endpoint });
        setState("off");
      }
    } catch (e) {
      toast.error(
        e instanceof Error && e.message === "permission-denied"
          ? t("pushDenied")
          : t("pushError")
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 pt-6">
        <div className="flex flex-col">
          <span>{t("notifications")}</span>
          {state === "unsupported" && (
            <span className="text-xs text-muted-foreground">{t("pushUnsupported")}</span>
          )}
          {state === "install-first" && (
            <span className="text-xs text-muted-foreground">{t("pushInstallFirst")}</span>
          )}
        </div>
        <Switch
          checked={state === "on"}
          disabled={busy || state === "loading" || state === "unsupported" || state === "install-first"}
          onCheckedChange={toggle}
          aria-label={t("notifications")}
        />
      </CardContent>
    </Card>
  );
}
