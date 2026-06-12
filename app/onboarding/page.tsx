"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
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
          <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate({ name })}>
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
