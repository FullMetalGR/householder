import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { signIn } from "./auth";

// Reproduction for the production report: household members land on
// /onboarding (or /sign-in) again after relaunching the installed PWA.
// Covers relaunch states the golden path never exercises: warm cookies,
// a session past its expires_at, a genuinely expired access token JWT,
// and a PWA cold launch whose first network fetch fails (standby radio),
// which must not serve a stale cached onboarding document for start_url "/".

const LOCAL_JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function mintExpiredJwt(payload: Record<string, unknown>): string {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now - 7200, exp: now - 3600 };
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify(body));
  const sig = createHmac("sha256", LOCAL_JWT_SECRET)
    .update(`${head}.${claims}`)
    .digest("base64url");
  return `${head}.${claims}.${sig}`;
}

type StoredSession = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  [k: string]: unknown;
};

// @supabase/ssr stores the session as base64url JSON across one or more
// sb-*-auth-token cookie chunks. Read, patch, write back.
async function readSession(context: BrowserContext): Promise<{ session: StoredSession; names: string[] }> {
  const cookies = await context.cookies("http://localhost:3000");
  const chunks = cookies
    .filter((c) => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  expect(chunks.length, "auth cookies should exist").toBeGreaterThan(0);
  const joined = chunks.map((c) => c.value).join("");
  expect(joined.startsWith("base64-")).toBe(true);
  const session = JSON.parse(Buffer.from(joined.slice("base64-".length), "base64url").toString());
  return { session, names: chunks.map((c) => c.name) };
}

async function writeSession(context: BrowserContext, names: string[], session: StoredSession) {
  const encoded = "base64-" + b64url(JSON.stringify(session));
  const per = Math.ceil(encoded.length / names.length);
  await context.clearCookies({ name: /^sb-.*-auth-token(\.\d+)?$/ });
  await context.addCookies(
    names.map((name, i) => ({
      name,
      value: encoded.slice(i * per, (i + 1) * per),
      url: "http://localhost:3000",
    }))
  );
}

async function expectLandsOnLists(page: Page, label: string) {
  await page.goto("/");
  await page.waitForURL(/\/(lists|onboarding|sign-in)/, { timeout: 15_000 });
  const where = new URL(page.url()).pathname;
  expect(where, `${label}: relaunch should land on /lists, landed on ${where}`).toBe("/lists");
}

test("relaunch keeps the owner in their household", async ({ browser }) => {
  test.setTimeout(180_000);
  const email = `reopen-a-${Date.now()}@test.local`;
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await signIn(page, email);
    await page.getByPlaceholder("π.χ. Σπίτι μας").fill("Reopen Σπίτι");
    await page.getByRole("button", { name: "Δημιουργία" }).click();
    await page.waitForURL("**/lists");

    // 1. Warm relaunch: cookies intact, token still valid.
    await expectLandsOnLists(page, "warm relaunch");

    // 2. Relaunch after expires_at passed: client + middleware must refresh.
    const { session, names } = await readSession(context);
    await writeSession(context, names, { ...session, expires_at: Math.floor(Date.now() / 1000) - 3600 });
    await expectLandsOnLists(page, "stale expires_at relaunch");

    // 3. Relaunch with a genuinely expired access token (as after hours away):
    // only the refresh token is still good.
    const fresh = await readSession(context);
    const claims = JSON.parse(
      Buffer.from(fresh.session.access_token.split(".")[1], "base64url").toString()
    );
    const expired = mintExpiredJwt(claims);
    await writeSession(context, fresh.names, {
      ...fresh.session,
      access_token: expired,
      expires_at: Math.floor(Date.now() / 1000) - 3600,
    });
    await expectLandsOnLists(page, "expired JWT relaunch");
  } finally {
    await context.close();
  }
});

test("relaunch keeps an invited member in the household", async ({ browser }) => {
  test.setTimeout(180_000);
  const emailA = `reopen-b-owner-${Date.now()}@test.local`;
  const emailB = `reopen-b-member-${Date.now()}@test.local`;
  let contextA: BrowserContext | undefined;
  let contextB: BrowserContext | undefined;
  try {
    contextA = await browser.newContext();
    const a = await contextA.newPage();
    await signIn(a, emailA);
    await a.getByPlaceholder("π.χ. Σπίτι μας").fill("Reopen Σπίτι Β");
    await a.getByRole("button", { name: "Δημιουργία" }).click();
    await a.waitForURL("**/lists");
    await a.goto("/settings");
    await a.getByRole("button", { name: "Νέα πρόσκληση" }).click();
    const codeEl = a.locator("code").first();
    await expect(codeEl).toBeVisible();
    const inviteCode = (await codeEl.innerText()).trim();

    contextB = await browser.newContext();
    const b = await contextB.newPage();
    await signIn(b, emailB);
    await b.getByPlaceholder("π.χ. ABCD2345").fill(inviteCode);
    await b.getByRole("button", { name: "Συμμετοχή" }).click();
    await b.waitForURL("**/lists");

    // Member relaunch: warm, then with expired access token.
    await expectLandsOnLists(b, "member warm relaunch");
    const { session, names } = await readSession(contextB);
    const claims = JSON.parse(
      Buffer.from(session.access_token.split(".")[1], "base64url").toString()
    );
    await writeSession(contextB, names, {
      ...session,
      access_token: mintExpiredJwt(claims),
      expires_at: Math.floor(Date.now() / 1000) - 3600,
    });
    await expectLandsOnLists(b, "member expired JWT relaunch");
  } finally {
    contextA?.close();
    await contextB?.close();
  }
});

test("PWA cold launch with failed first fetch must not resurrect onboarding", async ({ browser }) => {
  test.setTimeout(180_000);
  const email = `reopen-c-${Date.now()}@test.local`;
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    // The magic-link callback lands on "/" as a full document navigation while
    // the user has no household yet: the server 307s to /onboarding. This is
    // the request that can poison a runtime cache for start_url "/".
    await signIn(page, email);
    await page.getByPlaceholder("π.χ. Σπίτι μας").fill("Reopen Σπίτι Γ");
    await page.getByRole("button", { name: "Δημιουργία" }).click();
    await page.waitForURL("**/lists");

    // Let the service worker install, activate, and take control. Precaching
    // 48 entries against a cold server under full-suite load can be slow.
    await expect
      .poll(
        () => page.evaluate(async () => Boolean(navigator.serviceWorker.controller)),
        { timeout: 45_000 }
      )
      .toBe(true);

    // Cold launch with the network down for the first fetch (standby radio).
    await context.setOffline(true);
    const relaunch = await context.newPage();
    await relaunch.goto("/", { waitUntil: "domcontentloaded" }).catch(() => {});
    await relaunch.waitForTimeout(1500);

    const path = new URL(relaunch.url()).pathname;
    const onboardingVisible = await relaunch
      .getByPlaceholder("π.χ. Σπίτι μας")
      .isVisible()
      .catch(() => false);

    // Failure mode under investigation: the launch renders the cached
    // onboarding document for a signed-in member with a household.
    expect(
      onboardingVisible,
      `offline cold launch rendered the onboarding form (url: ${path}); ` +
        "a member with a household must never be offered household creation"
    ).toBe(false);
  } finally {
    await context.close();
  }
});
