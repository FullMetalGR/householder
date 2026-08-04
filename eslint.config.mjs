import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Deno edge functions are not part of the Next.js lint surface.
    "supabase/functions/**",
    // Scratch files the Supabase CLI generates during `supabase start`
    // (newer CLIs write a bundled edge-runtime bootstrap here).
    "supabase/.temp/**",
  ]),
]);

export default eslintConfig;
