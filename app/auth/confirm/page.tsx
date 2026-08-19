import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { safeNext } from "@/lib/safe-next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// The email's `next` is the full RedirectTo URL; strip it down to a safe
// same-origin path so the redirect can never leave the app.
function toPath(raw: string): string {
  try {
    const url = new URL(raw);
    return safeNext(url.pathname + url.search);
  } catch {
    return safeNext(raw);
  }
}

// Renders a confirmation button; only its POST consumes the single-use
// token_hash, so a GET from a mailbox prescanner or omnibox preload is inert.
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const t = await getTranslations("auth");
  const params = await searchParams;
  const tokenHash = typeof params.token_hash === "string" ? params.token_hash : "";
  const next = typeof params.next === "string" ? params.next : "/";
  const expired = params.error === "expired";

  async function confirm() {
    "use server";
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.verifyOtp({
      type: "email",
      token_hash: tokenHash,
    });
    if (error) redirect("/auth/confirm?error=expired");
    redirect(toPath(next));
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {expired ? (
            <>
              <p className="text-sm text-muted-foreground">{t("confirmExpired")}</p>
              <Button asChild className="w-full">
                <a href="/sign-in">{t("confirmRetry")}</a>
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{t("confirmHint")}</p>
              <form action={confirm}>
                <Button type="submit" className="w-full">
                  {t("confirmCta")}
                </Button>
              </form>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
