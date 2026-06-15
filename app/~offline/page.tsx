import { getTranslations } from "next-intl/server";
import { WifiOff } from "lucide-react";

export default async function OfflinePage() {
  const t = await getTranslations("offline");
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center">
      <WifiOff size={40} className="text-muted-foreground" />
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("hint")}</p>
    </div>
  );
}
