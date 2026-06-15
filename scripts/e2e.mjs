// Builds the app against the local Supabase stack, then runs Playwright.
// NEXT_PUBLIC_* values are inlined at build time, so the build must happen
// after the env is resolved from `supabase status`.
import { execSync, spawnSync } from "node:child_process";

const raw = execSync("npx supabase status -o json", { encoding: "utf8" });
const status = JSON.parse(raw.slice(raw.indexOf("{")));
process.env.NEXT_PUBLIC_SUPABASE_URL = status.API_URL ?? "http://127.0.0.1:54321";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = status.ANON_KEY;
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ??= "BPlaceholderKeyForE2EOnly";

execSync("npx next build", { stdio: "inherit", env: process.env });
const result = spawnSync("npx", ["playwright", "test", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
  shell: false,
});
process.exit(result.status ?? 1);
