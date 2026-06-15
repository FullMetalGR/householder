import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { List, History, Settings } from "lucide-react";
import { OfflineBanner } from "@/components/offline-banner";

export default async function TabsLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations("tabs");
  const tabs = [
    { href: "/lists", label: t("lists"), Icon: List },
    { href: "/history", label: t("history"), Icon: History },
    { href: "/settings", label: t("settings"), Icon: Settings },
  ];
  return (
    <div className="flex min-h-dvh flex-col">
      <OfflineBanner />
      <main className="flex-1 pb-20">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 border-t bg-card">
        <div className="mx-auto flex max-w-md justify-around py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {tabs.map(({ href, label, Icon }) => (
            <Link key={href} href={href} className="flex flex-col items-center gap-1 px-4 py-1 text-xs text-muted-foreground">
              <Icon size={20} />
              {label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
