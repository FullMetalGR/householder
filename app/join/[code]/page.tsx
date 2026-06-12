"use client";

import { use, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { toast } from "sonner";

export default function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const t = useTranslations("join");
  const trpc = useTRPC();
  const router = useRouter();
  const fired = useRef(false);

  const redeem = useMutation(
    trpc.invite.redeem.mutationOptions({
      onSuccess: () => router.replace("/lists"),
      onError: (err) => {
        if (err.data?.code === "UNAUTHORIZED") {
          router.replace(`/sign-in?next=/join/${code}`);
        } else {
          toast.error(t("failed"));
          router.replace("/");
        }
      },
    })
  );

  useEffect(() => {
    if (!fired.current) {
      fired.current = true;
      redeem.mutate({ code });
    }
  }, [code, redeem]);

  return (
    <main className="flex min-h-dvh items-center justify-center">
      <p className="text-muted-foreground">{t("joining")}</p>
    </main>
  );
}
