import { getTranslations } from "next-intl/server";

export default async function HistoryPage() {
  const t = await getTranslations();
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold">{t("tabs.history")}</h1>
      <p className="mt-4 text-muted-foreground">{t("placeholder.comingSoon")}</p>
    </div>
  );
}
