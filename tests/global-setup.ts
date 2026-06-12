import { execSync } from "node:child_process";

export default function setup() {
  const raw = execSync("npx supabase status -o json", { encoding: "utf8" });
  const status = JSON.parse(raw.slice(raw.indexOf("{")));
  process.env.SUPABASE_URL = status.API_URL ?? "http://127.0.0.1:54321";
  process.env.SUPABASE_ANON_KEY = status.ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = status.SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
}
