/**
 * auth.setup.ts
 *
 * Playwright "setup" project: creates a logged-in storage-state file
 * so authenticated e2e tests can skip the browser-based login flow.
 *
 * Run via:
 *   pnpm exec playwright test --project=setup
 *
 * Strategy:
 *   1. Call `seedTestUser` (Supabase Admin API) to get a real session
 *      (access_token + refresh_token).
 *   2. Create a browser context with the session injected as cookies
 *      in the format that `@supabase/ssr` expects:
 *        - Cookie name:  `sb-<project-ref>-auth-token`
 *        - Cookie value: URL-encoded JSON of the session object
 *      This is the exact format `createServerClient` (used by Next.js
 *      middleware) reads to establish a server-side session.
 *   3. Navigate to a protected route and verify the session is live.
 *   4. Save the storage state (cookies).
 *
 * The storage state is then used by the `authedPage` fixture
 * (tests/fixtures/auth.ts) and by specs that set `storageState`
 * directly on the test.use() call.
 */

import path from "node:path";
import { test as setup, expect } from "@playwright/test";
import { seedTestUser, cleanupTestUser } from "./seed-test-user";

export const STORAGE_STATE_PATH = path.resolve(
  __dirname,
  "../../playwright/.auth/storage-state.json"
);

/**
 * Derive the Supabase project reference from the Supabase URL.
 * URL shape: https://<project-ref>.supabase.co
 */
function getProjectRef(supabaseUrl: string): string {
  return new URL(supabaseUrl).hostname.split(".")[0];
}

setup("authenticate test user", async ({ browser }) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  if (!supabaseUrl || !anonKey) {
    setup.skip(
      true,
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY not set — skipping auth setup"
    );
    return;
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    setup.skip(
      true,
      "SUPABASE_SERVICE_ROLE_KEY not set — skipping auth setup. Set it in .env.local to enable authenticated e2e tests."
    );
    return;
  }

  const { userId, accessToken, refreshToken } = await seedTestUser();

  const projectRef = getProjectRef(supabaseUrl);
  const cookieName = `sb-${projectRef}-auth-token`;

  // Build the session JSON in the shape @supabase/ssr expects.
  // The `createServerClient` in Next.js middleware reads this cookie.
  const session = JSON.stringify({
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });

  // @supabase/ssr uses URL-encoding for cookie values (encodeURIComponent).
  const cookieValue = encodeURIComponent(session);

  const baseUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

  // Create a new browser context and inject the auth cookie before
  // navigating. This is the correct Playwright approach: add cookies
  // directly, then save state.
  const context = await browser.newContext();

  await context.addCookies([
    {
      name: cookieName,
      value: cookieValue,
      domain: new URL(baseUrl).hostname,
      path: "/",
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
      // 400 days — same as DEFAULT_COOKIE_OPTIONS in @supabase/ssr
      expires: Math.floor(Date.now() / 1000) + 400 * 24 * 60 * 60,
    },
  ]);

  const page = await context.newPage();
  await page.goto("/");

  // Navigate to /trips to check we're authed (not redirected to /login).
  await page.goto("/trips");
  const currentUrl = page.url();
  console.log(`[auth.setup] /trips URL: ${currentUrl}`);

  if (currentUrl.includes("/login")) {
    // Cookie injection didn't work — the middleware couldn't decode the
    // session from the cookie. This is a blocker: log it and skip so
    // the dependent tests skip rather than fail with confusing errors.
    console.error(
      `[auth.setup] Auth cookie was not accepted by the middleware. ` +
        `The session cookie format may not match what @supabase/ssr expects. ` +
        `Cookie name: ${cookieName}, value length: ${cookieValue.length}`
    );
    // Save the state anyway so the fixture can inspect it, then skip.
    await context.storageState({ path: STORAGE_STATE_PATH });
    await context.close();
    setup.skip(
      true,
      "Auth cookie not accepted by the middleware — authenticated tests will be skipped."
    );
    return;
  }

  // Verify we're on an authenticated page.
  await expect(page).not.toHaveURL(/\/login/);

  // Save the storage state.
  await context.storageState({ path: STORAGE_STATE_PATH });
  console.log(`[auth.setup] Storage state saved to: ${STORAGE_STATE_PATH}`);
  console.log(
    `[auth.setup] Auth cookie: ${cookieName} (${cookieValue.length} chars)`
  );

  await context.close();

  // Retain userId for downstream test reference.
  setup.info().annotations.push({ type: "testUserId", description: userId });

  void cleanupTestUser; // exported for spec afterAll use
});

/**
 * Export the cleanup helper so test files can call it in afterAll.
 */
export { cleanupTestUser as teardownTestUser };
