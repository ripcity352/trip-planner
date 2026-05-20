/**
 * Cross-device magic-link E2E test — regression for #137.
 *
 * The bug: @supabase/ssr defaults to PKCE, which stores a `code_verifier`
 * cookie on the requesting browser. If the link is opened in a different
 * browser/device/cookie-jar, the `code_verifier` is missing and auth fails
 * with `AuthPKCECodeVerifierMissingError`.
 *
 * The fix: token-hash flow. The magic-link URL carries a `token_hash`
 * instead of a `code`. `/auth/callback` calls `verifyOtp({ token_hash, type })`
 * which is self-contained and requires no cookie from the requesting browser.
 *
 * ## How this test works
 *
 * 1. **Context A** (simulates "device that requests the link") calls the
 *    Supabase Admin API (`auth.admin.generateLink`) to mint a token-hash
 *    magic link without going through the browser at all — so there is no
 *    `code_verifier` cookie anywhere.
 * 2. **Context B** (simulates "device that clicks the link") opens the
 *    resulting callback URL in a fresh, isolated browser context with no
 *    shared cookies. If the token-hash flow is wired correctly, auth
 *    succeeds and Playwright lands on `/trips`. If the PKCE flow were still
 *    used, it would fail with a `pkce_code_verifier_not_found` error and
 *    redirect to `/login?error=auth`.
 *
 * ## Skipping in CI without service-role key
 *
 * The Admin API requires `SUPABASE_SERVICE_ROLE_KEY`. Tests are skipped
 * gracefully when the key is absent so CI without Supabase env vars stays
 * green.
 *
 * ## Note on email-template format
 *
 * This test uses `auth.admin.generateLink` with `type: 'magiclink'`, which
 * returns the raw `token_hash` in the `properties` field. We construct the
 * callback URL ourselves with `token_hash` + `type=email` params, matching
 * the format the Supabase Dashboard email template should be updated to
 * produce (see PR body for the exact template change required in the
 * Supabase Dashboard).
 */

import { test, expect, chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

const CROSS_DEVICE_TEST_EMAIL =
  process.env.E2E_CROSS_DEVICE_EMAIL ?? "cross-device-test@example.com";

/**
 * Make a Supabase admin client for test scaffolding only.
 * Uses the service-role key — never exposed to browser contexts.
 */
function makeAdminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

test.describe("cross-device magic-link (token-hash flow)", () => {
  test.beforeEach(({ }, testInfo) => {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      testInfo.skip(true,
        "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping cross-device test"
      );
    }
  });

  test(
    "magic link opened in a different cookie jar succeeds and lands on /trips",
    async () => {
      const admin = makeAdminClient();

      // ── Step 1: ensure the test user exists ────────────────────────────
      // createUser is idempotent-ish: if the email is taken, we proceed.
      await admin.auth.admin.createUser({
        email: CROSS_DEVICE_TEST_EMAIL,
        email_confirm: true,
      });

      // ── Step 2: generate a token-hash magic link via the Admin API ─────
      // `generateLink` with type "magiclink" mints a one-time link and
      // returns the underlying `token_hash` in `properties`. We use the
      // hash directly so the test is independent of the email-template
      // format — what matters is that the callback can handle it.
      const { data: linkData, error: linkError } =
        await admin.auth.admin.generateLink({
          type: "magiclink",
          email: CROSS_DEVICE_TEST_EMAIL,
        });

      if (linkError) {
        throw new Error(
          `cross-device test: generateLink failed — ${linkError.message}`
        );
      }

      const tokenHash = linkData.properties?.hashed_token;
      if (!tokenHash) {
        throw new Error(
          "cross-device test: generateLink did not return hashed_token in properties"
        );
      }

      // Build the callback URL the way the email template will produce it
      // after the Supabase Dashboard template change documented in the PR.
      const callbackUrl = `${BASE_URL}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=email&next=/trips`;

      // ── Step 3: open the link in a fresh, isolated browser context ─────
      // This simulates "device B" — no cookies, no code_verifier, no
      // prior session. A PKCE-based callback would fail here.
      const browser = await chromium.launch();
      const deviceBContext = await browser.newContext({
        // Explicit empty state — no shared cookies with context A
        storageState: { cookies: [], origins: [] },
      });
      const deviceBPage = await deviceBContext.newPage();

      try {
        await deviceBPage.goto(callbackUrl);

        // After a successful token-hash exchange, the callback redirects
        // to `next` (/trips). We should NOT land on /login?error=auth.
        await expect(deviceBPage).toHaveURL(/\/trips/, { timeout: 10_000 });
      } finally {
        await deviceBContext.close();
        await browser.close();
      }
    }
  );

  test(
    "callback with no params still falls through to /login?error=auth (smoke)",
    async ({ page }) => {
      // This is the deterministic branch — no Supabase call needed.
      await page.goto(`${BASE_URL}/auth/callback`);
      await expect(page).toHaveURL(/\/login\?error=auth/, { timeout: 5_000 });
    }
  );

  test(
    "callback with token_hash but missing type falls through to /login?error=auth",
    async ({ page }) => {
      // The callback-handler requires both token_hash and type.
      // A malformed URL with only token_hash should fail safely.
      await page.goto(
        `${BASE_URL}/auth/callback?token_hash=fake-hash-no-type`
      );
      await expect(page).toHaveURL(/\/login\?error=auth/, { timeout: 5_000 });
    }
  );
});
