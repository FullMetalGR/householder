import { test, expect } from "@playwright/test";
import { magicLinkFor } from "./mailpit";
import { signIn } from "./auth";

// The magic-link flow must survive the two real-world hazards that burned
// single-use PKCE codes: mailbox link prescanners fetching the URL and
// browsers preloading it. Only the explicit button press may verify.

test("magic link signs in via the confirm button, surviving a prescan", async ({
  page,
  request,
}) => {
  const email = `e2e-confirm-${Date.now()}@test.local`;

  await page.goto("/sign-in");
  await page.getByPlaceholder("Το email σου").fill(email);
  await page.getByRole("button", { name: "Στείλε μου σύνδεσμο" }).click();

  const link = await magicLinkFor(email);
  expect(link).toContain("/auth/confirm");

  // A mailbox prescanner fetches the link (isolated cookie jar, plain GET).
  const prescan = await request.get(link);
  expect(prescan.ok()).toBeTruthy();

  // The user opens the same link afterwards: not signed in yet, sees a button.
  await page.goto(link);
  const button = page.getByRole("button", { name: "Σύνδεση", exact: true });
  await expect(button).toBeVisible();

  // Only the button press verifies; a fresh user lands on onboarding.
  await button.click();
  await page.waitForURL("**/onboarding", { timeout: 15_000 });
});

test("a burned or invalid link explains itself and offers a way back", async ({
  page,
}) => {
  await page.goto("/auth/confirm?token_hash=deadbeef&type=email");
  await page.getByRole("button", { name: "Σύνδεση", exact: true }).click();
  await expect(
    page.getByText("Ο σύνδεσμος έληξε ή έχει ήδη χρησιμοποιηθεί.")
  ).toBeVisible();
  await page.getByRole("link", { name: "Ζήτησε νέο σύνδεσμο" }).click();
  await page.waitForURL("**/sign-in");
});

test("sign-in self-heals into the app when a session already exists", async ({
  page,
}) => {
  const email = `e2e-heal-${Date.now()}@test.local`;
  await signIn(page, email);
  // Opening the link in another browser bounced the user here while their
  // session actually existed; the page must route them in, not show the form.
  await page.goto("/sign-in");
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"), {
    timeout: 10_000,
  });
});
