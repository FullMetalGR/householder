import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export default async function RootPage() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/sign-in");
  // A failed lookup must not read as "no membership": routing a real member
  // to onboarding invites duplicate household creation. Transient failures
  // (cold starts, sub-second auth/PostgREST clock skew on a fresh token) get
  // brief retries; a persistent failure surfaces to the error boundary.
  let memberships: { household_id: string }[] | null = null;
  let lastError = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 700));
    const { data, error } = await supabase
      .from("household_members")
      .select("household_id")
      .limit(1);
    if (!error) {
      memberships = data;
      break;
    }
    lastError = error.message;
  }
  if (!memberships) throw new Error(`membership lookup failed: ${lastError}`);
  if (memberships.length === 0) redirect("/onboarding");
  redirect("/lists");
}
