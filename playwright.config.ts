import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    // Never reuse a lingering server: scripts/e2e.mjs rebuilds .next first,
    // and a server started before the rebuild serves the old buildId, which
    // 500s the new build's precache manifest and wedges SW installation.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
