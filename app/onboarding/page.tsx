"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

export default function OnboardingPage() {
  const t = useTranslations("onboarding");
  const trpc = useTRPC();
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  // A member with a household must never see this page: a stale cached
  // launch document (or a deep link) can land them here, and re-creating
  // makes a duplicate household. Only a confirmed membership redirects.
  const mine = useQuery(trpc.household.listMine.queryOptions());
  const hasHousehold = (mine.data?.length ?? 0) > 0;
  useEffect(() => {
    if (hasHousehold) router.replace("/lists");
  }, [hasHousehold, router]);
  const membershipUnknown = mine.isLoading || hasHousehold;

  const create = useMutation(
    trpc.household.create.mutationOptions({
      onSuccess: () => router.replace("/lists"),
      onError: () => toast.error(t("invalidCode")),
    })
  );
  const redeem = useMutation(
    trpc.invite.redeem.mutationOptions({
      onSuccess: () => router.replace("/lists"),
      onError: () => toast.error(t("invalidCode")),
    })
  );

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <Card className="w-full max-w-sm">
        <CardHeader><CardTitle>{t("createTitle")}</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} />
          <Button disabled={!name.trim() || create.isPending || membershipUnknown} onClick={() => create.mutate({ name })}>
            {t("createButton")}
          </Button>
        </CardContent>
      </Card>
      <Card className="w-full max-w-sm">
        <CardHeader><CardTitle>{t("joinTitle")}</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("codePlaceholder")} />
          <Button variant="outline" disabled={!code.trim() || redeem.isPending} onClick={() => redeem.mutate({ code })}>
            {t("joinButton")}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
