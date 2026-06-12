import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export default async function RootPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/sign-in");
  const { data: memberships } = await supabase
    .from("household_members")
    .select("household_id")
    .limit(1);
  if (!memberships || memberships.length === 0) redirect("/onboarding");
  redirect("/lists");
}
