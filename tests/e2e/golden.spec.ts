import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { magicLinkFor } from "./mailpit";

// The golden path: two household members drive the whole product surface in
// one continuous story. Runs against the production build and the local
// Supabase stack; the live-sync assertions must pass without any reload.

const CONTEXT_PERMISSIONS = ["notifications", "clipboard-read", "clipboard-write"];

async function signIn(page: Page, email: string) {
  await page.goto("/sign-in");
  await page.getByPlaceholder("Το email σου").fill(email);
  await page.getByRole("button", { name: "Στείλε μου σύνδεσμο" }).click();
  const link = await magicLinkFor(email);
  await page.goto(link);
  await page.waitForURL("**/onboarding");
}

async function quickAdd(page: Page, name: string) {
  const input = page.getByPlaceholder("Προσθήκη προϊόντος...");
  await input.fill(name);
  // Wait for the server to confirm the add, not just the optimistic render:
  // otherwise a navigation right after can abort the in-flight request and
  // the item is silently lost. The mutation goes through the tRPC endpoint.
  const saved = page.waitForResponse(
    (r) =>
      r.url().includes("/api/trpc/") &&
      r.url().includes("item.add") &&
      r.request().method() === "POST"
  );
  await input.press("Enter");
  await saved;
  await expect(itemToggle(page, name)).toBeVisible();
}

// Each item renders two buttons: the check toggle (aria-label = item name,
// aria-pressed) and the detail opener (visible text). getByLabel targets the
// toggle only, so it doubles as the presence check for an item.
function itemToggle(page: Page, name: string) {
  return page.getByLabel(name, { exact: true });
}

test("golden path: two members share lists live", async ({ browser }) => {
  test.setTimeout(180_000);

  const emailA = `e2e-a-${Date.now()}@test.local`;
  const emailB = `e2e-b-${Date.now()}@test.local`;

  let contextA: BrowserContext | undefined;
  let contextB: BrowserContext | undefined;
  try {
    contextA = await browser.newContext();
    await contextA.grantPermissions(CONTEXT_PERMISSIONS);
    const a = await contextA.newPage();

    // 1. User A signs in via magic link.
    await signIn(a, emailA);

    // 2. A creates the household.
    await a.getByPlaceholder("π.χ. Σπίτι μας").fill("E2E Σπίτι");
    await a.getByRole("button", { name: "Δημιουργία" }).click();
    await a.waitForURL("**/lists");

    // 3. A creates a list through the FAB dialog.
    await a.getByRole("button", { name: "Νέα λίστα" }).click();
    const newListDialog = a.getByRole("dialog");
    await newListDialog.getByPlaceholder("π.χ. Σούπερ μάρκετ").fill("Λαϊκή");
    await newListDialog.getByRole("button", { name: "Δημιουργία" }).click();
    await a.waitForURL(/\/lists\/[0-9a-f-]+$/);
    const listUrl = a.url();

    // 4. A quick-adds two items.
    await quickAdd(a, "Γάλα");
    await quickAdd(a, "Ψωμί");

    // 5. A creates an invite in Settings and reads the code.
    await a.goto("/settings");
    await a.getByRole("button", { name: "Νέα πρόσκληση" }).click();
    const codeEl = a.locator("code").first();
    await expect(codeEl).toBeVisible();
    const inviteCode = (await codeEl.innerText()).trim();
    expect(inviteCode).toMatch(/^[A-Z2-9]{8}$/);

    // 6. User B signs in and joins with the code.
    contextB = await browser.newContext();
    await contextB.grantPermissions(CONTEXT_PERMISSIONS);
    const b = await contextB.newPage();
    await signIn(b, emailB);
    await b.getByPlaceholder("π.χ. ABCD2345").fill(inviteCode);
    await b.getByRole("button", { name: "Συμμετοχή" }).click();
    await b.waitForURL("**/lists");
    await expect(b.getByRole("link", { name: /Λαϊκή/ })).toBeVisible();

    // 7. Both members open the same list. These are cold detail-route loads
    // (page load plus the list query), so they get headroom beyond the 5s
    // default; the assertion still resolves the instant the item renders.
    await a.goto(listUrl);
    await expect(itemToggle(a, "Ψωμί")).toBeVisible({ timeout: 15_000 });
    await b.getByRole("link", { name: /Λαϊκή/ }).click();
    await b.waitForURL(/\/lists\/[0-9a-f-]+$/);
    await expect(itemToggle(b, "Ψωμί")).toBeVisible({ timeout: 15_000 });
    // Give both freshly mounted realtime channels a moment to subscribe.
    await a.waitForTimeout(1500);

    // 8. B adds an item; it must appear on A's open page without a reload.
    await quickAdd(b, "Τυρί");
    await expect(itemToggle(a, "Τυρί")).toBeVisible({ timeout: 7000 });

    // 9. A checks an item; B sees it checked without a reload.
    await itemToggle(a, "Γάλα").click();
    await expect(itemToggle(b, "Γάλα")).toHaveAttribute("aria-pressed", "true", {
      timeout: 7000,
    });

    // 10. A completes the list and carries over the two unchecked items.
    await a.getByRole("button", { name: "Τέλος" }).click();
    const completeDialog = a.getByRole("dialog");
    await expect(completeDialog.getByText("2 προϊόντα δεν αγοράστηκαν")).toBeVisible();
    await completeDialog.getByRole("button", { name: "Μεταφορά σε νέα λίστα" }).click();
    await a.waitForURL(
      (url) => /\/lists\/[0-9a-f-]+$/.test(url.pathname) && url.href !== listUrl
    );
    const carryUrl = a.url();
    await expect(itemToggle(a, "Ψωμί")).toHaveAttribute("aria-pressed", "false");
    await expect(itemToggle(a, "Τυρί")).toHaveAttribute("aria-pressed", "false");
    await expect(itemToggle(a, "Γάλα")).toHaveCount(0);

    // 11. History shows the completed trip; Again clones all of its items.
    await a.goto("/history");
    await expect(a.getByText("Λαϊκή")).toBeVisible();
    await a.getByRole("button", { name: "Ξανά" }).click();
    await a.waitForURL(
      (url) =>
        /\/lists\/[0-9a-f-]+$/.test(url.pathname) &&
        url.href !== listUrl &&
        url.href !== carryUrl
    );
    await expect(itemToggle(a, "Γάλα")).toBeVisible();
    await expect(itemToggle(a, "Ψωμί")).toBeVisible();
    await expect(itemToggle(a, "Τυρί")).toBeVisible();

    // 12. Language switch to English and back.
    await a.goto("/settings");
    await a.getByRole("combobox").first().click();
    await a.getByRole("option", { name: "English" }).click();
    await expect(a.getByRole("link", { name: "Lists" })).toBeVisible({ timeout: 10_000 });
    await a.getByRole("combobox").first().click();
    await a.getByRole("option", { name: "Ελληνικά" }).click();
    await expect(a.getByRole("link", { name: "Λίστες" })).toBeVisible({ timeout: 10_000 });

    // 13. The production build registered the service worker.
    await expect
      .poll(
        () =>
          a.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration())),
        { timeout: 15_000 }
      )
      .toBe(true);
  } finally {
    await contextA?.close();
    await contextB?.close();
  }
});
