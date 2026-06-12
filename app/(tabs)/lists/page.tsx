import { getTranslations } from "next-intl/server";

export default async function ListsPage() {
  const t = await getTranslations();
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold">{t("tabs.lists")}</h1>
      <p className="mt-4 text-muted-foreground">{t("placeholder.comingSoon")}</p>
    </div>
  );
}
