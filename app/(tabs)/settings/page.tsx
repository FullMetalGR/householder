"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { setLocale } from "@/actions/set-locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trash2, Share2 } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const t = useTranslations("settings");
  const locale = useLocale();
  const { theme, setTheme } = useTheme();
  const trpc = useTRPC();
  const qc = useQueryClient();
  const router = useRouter();

  const profile = useQuery(trpc.profile.get.queryOptions());
  const mine = useQuery(trpc.household.listMine.queryOptions());

  const firstMembership = mine.data?.[0];
  const householdId: string | undefined = firstMembership?.household?.id ?? undefined;

  const members = useQuery({
    ...trpc.household.members.list.queryOptions({ householdId: householdId! }),
    enabled: !!householdId,
  });
  const invites = useQuery({
    ...trpc.invite.list.queryOptions({ householdId: householdId! }),
    enabled: !!householdId,
  });

  const [name, setName] = useState("");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (profile.data?.display_name) setName(profile.data.display_name);
  }, [profile.data?.display_name]);
  const updateProfile = useMutation(
    trpc.profile.update.mutationOptions({
      onSuccess: () => {
        toast.success(t("saved"));
        qc.invalidateQueries();
      },
    })
  );
  const createInvite = useMutation(
    trpc.invite.create.mutationOptions({
      onSuccess: async (inv) => {
        qc.invalidateQueries();
        if (navigator.share) {
          try {
            await navigator.share({ url: inv.link, text: inv.code });
          } catch (e) {
            if ((e as Error).name !== "AbortError") {
              await navigator.clipboard.writeText(inv.link);
              toast.success(t("copied"));
            }
          }
        } else {
          await navigator.clipboard.writeText(inv.link);
          toast.success(t("copied"));
        }
      },
    })
  );
  const revokeInvite = useMutation(
    trpc.invite.revoke.mutationOptions({ onSuccess: () => qc.invalidateQueries() })
  );
  const removeMember = useMutation(
    trpc.household.members.remove.mutationOptions({ onSuccess: () => qc.invalidateQueries() })
  );
  const leave = useMutation(
    trpc.household.leave.mutationOptions({
      onSuccess: () => router.replace("/"),
      onError: () => toast.error(t("leaveBlocked")),
    })
  );

  async function changeLanguage(next: "el" | "en") {
    await setLocale(next);
    updateProfile.mutate({ locale: next });
  }

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/sign-in");
  }

  const myId = profile.data?.id;
  const amOwner = members.data?.some((m) => m.user_id === myId && m.role === "owner") ?? false;

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">{t("title")}</h1>

      <Card>
        <CardHeader><CardTitle>{t("profile")}</CardTitle></CardHeader>
        <CardContent className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src={profile.data?.avatar_url ?? undefined} />
            <AvatarFallback>{profile.data?.display_name?.[0] ?? "?"}</AvatarFallback>
          </Avatar>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("displayName")}
          />
          <Button
            disabled={!name.trim() || updateProfile.isPending}
            onClick={() => updateProfile.mutate({ displayName: name })}
          >
            {t("save")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("members")}</CardTitle></CardHeader>
        <CardContent className="flex flex-col gap-3">
          {members.data?.map((m) => {
            return (
              <div key={m.user_id} className="flex items-center gap-3">
                <Avatar>
                  <AvatarImage src={m.profile?.avatar_url ?? undefined} />
                  <AvatarFallback>{m.profile?.display_name?.[0] ?? "?"}</AvatarFallback>
                </Avatar>
                <span className="flex-1">{m.profile?.display_name}</span>
                {m.role === "owner" && (
                  <span className="text-xs text-muted-foreground">{t("owner")}</span>
                )}
                {amOwner && m.user_id !== myId && (
                  <Button
                    variant="outline" size="icon"
                    onClick={() => removeMember.mutate({ householdId: householdId!, userId: m.user_id })}
                  >
                    <Trash2 size={16} />
                  </Button>
                )}
              </div>
            );
          })}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{t("invites")}</span>
            <Button
              variant="outline" size="sm"
              disabled={!householdId || createInvite.isPending}
              onClick={() => createInvite.mutate({ householdId: householdId! })}
            >
              <Share2 size={14} /> {t("newInvite")}
            </Button>
          </div>
          {invites.data?.map((inv) => (
            <div key={inv.id} className="flex items-center justify-between text-sm">
              <code>{inv.code}</code>
              <Button variant="ghost" size="sm" onClick={() => revokeInvite.mutate({ inviteId: inv.id })}>
                {t("revoke")}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <div className="flex items-center justify-between">
            <span>{t("language")}</span>
            <Select value={locale} onValueChange={(v) => changeLanguage(v as "el" | "en")}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="el">&#917;&#955;&#955;&#951;&#957;&#953;&#954;&#940;</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between">
            <span>{t("theme")}</span>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="light">{t("themeLight")}</SelectItem>
                <SelectItem value="dark">{t("themeDark")}</SelectItem>
                <SelectItem value="system">{t("themeSystem")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" disabled={!householdId}>
            <Trash2 size={16} /> {t("leave")}
          </Button>
        </DialogTrigger>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{t("leaveConfirm")}</DialogTitle></DialogHeader>
          <DialogFooter>
            <Button variant="destructive" onClick={() => leave.mutate({ householdId: householdId! })}>
              {t("leave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Button variant="ghost" onClick={signOut}>{t("signOut")}</Button>
    </div>
  );
}
