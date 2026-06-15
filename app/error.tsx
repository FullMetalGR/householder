"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function RouteError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  const t = useTranslations("errors");
  useEffect(() => {
    // Production server errors arrive as opaque digests; the console is the
    // only client-side breadcrumb for what actually broke.
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-lg font-semibold">{t("boundaryTitle")}</h1>
      <Button onClick={() => unstable_retry()}>{t("retry")}</Button>
    </div>
  );
}
