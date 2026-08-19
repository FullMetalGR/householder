import { type Page } from "@playwright/test";
import { magicLinkFor } from "./mailpit";

// Sign in via magic link and land on /onboarding (fresh users only).
//
// After a CPU-pegged `next build`, local Docker/WSL2 clocks can lag enough
// that PostgREST rejects the seconds-old access token ("JWT issued at
// future") and "/" renders the error boundary. The app's answer to any
// transient membership-lookup failure is an honest retry page, so recover
// here the way a user does: press retry until routing succeeds.
export async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByPlaceholder("Το email σου").fill(email);
  await page.getByRole("button", { name: "Στείλε μου σύνδεσμο" }).click();
  const link = await magicLinkFor(email);
  await page.goto(link);
  // The link lands on the confirm page; only the button's POST verifies.
  await page.getByRole("button", { name: "Σύνδεση", exact: true }).click();
  for (let attempt = 0; ; attempt++) {
    try {
      await page.waitForURL("**/onboarding", { timeout: 10_000 });
      return;
    } catch (err) {
      const retry = page.getByRole("button", { name: "Δοκίμασε ξανά" });
      if (attempt >= 4 || !(await retry.isVisible().catch(() => false))) throw err;
      await retry.click();
    }
  }
}
