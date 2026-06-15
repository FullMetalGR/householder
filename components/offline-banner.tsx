"use client";

import { useTranslations } from "next-intl";
import { WifiOff } from "lucide-react";
import { useOnline } from "@/lib/use-online";

export function OfflineBanner() {
  const t = useTranslations("offline");
  const online = useOnline();
  if (online) return null;
  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-muted px-3 py-1.5 text-xs text-muted-foreground">
      <WifiOff size={14} />
      {t("banner")}
    </div>
  );
}
