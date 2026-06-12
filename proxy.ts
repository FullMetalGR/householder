import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  // Intentional: updateSession calls supabase.auth.getUser() on every matched
  // request, including /api/trpc. It keeps session cookies fresh on API paths;
  // revisit excluding api/ from the matcher if it ever shows up in latency.
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)"],
};
