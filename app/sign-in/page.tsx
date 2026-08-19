import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import SignInScreen from "./sign-in-form";

// Self-heals the "bounced but actually signed in" case: with a live session
// the form is never shown, the user is routed straight into the app.
export default async function SignInPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");
  return <SignInScreen />;
}
