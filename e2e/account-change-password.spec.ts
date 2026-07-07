/**
 * E2E spec: /account/sign-in-and-security — password change and OTP recovery.
 *
 * M5/PR4. DO NOT run locally — CI executes this spec only.
 *
 * Covers:
 *   - State A: happy-path password change (success + wrong-current error)
 *   - State C: full 3-step OTP recovery flow
 *   - Session revocation: other-device cross-context verification
 *
 * Assumption: a test user exists in the Supabase test project with
 * email TEST_USER_EMAIL and password TEST_USER_PASSWORD (seeded via
 * the fixtures script in supabase/seed.sql or CI env vars).
 */

import { test, expect, type BrowserContext, type Page } from "@playwright/test";

// F10 #7: this spec was documented "DO NOT run locally — CI executes
// this spec only" but had no enforced guard, so a local full-suite run
// reported it as FAILED (auth/env preconditions only CI satisfies)
// instead of SKIPPED. Make the documented constraint real: skip the
// entire file unless running under CI.
test.skip(
  !process.env.CI,
  "CI-only spec — requires CI-provisioned auth/env preconditions. See file header."
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ACCOUNT_SECURITY_URL = "/account/sign-in-and-security";

async function signInAs(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  await page.goto("/login");
  await page.fill('input[type="email"]', email);
  await page.click('button:has-text("Continue")');
  await page.fill('input[type="password"]', password);
  await page.click('button:has-text("Sign in")');
  // Wait until the redirect resolves (authed layout header becomes visible)
  await page.waitForURL(/\/trips/, { timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// State A: password change — happy path
// ---------------------------------------------------------------------------

test.describe("State A — password change", () => {
  test("user can change their password successfully", async ({ page }) => {
    const email = process.env.E2E_TEST_USER_EMAIL ?? "e2e-user@example.com";
    const currentPassword = process.env.E2E_TEST_USER_PASSWORD ?? "e2e-password";
    const newPassword = `rotated-${Date.now()}`;

    await signInAs(page, email, currentPassword);
    await page.goto(ACCOUNT_SECURITY_URL);

    // Verify page title
    await expect(page.getByRole("heading", { name: /sign-in & security/i })).toBeVisible();

    // Fill in the form
    await page.fill('[data-testid="current-password-input"]', currentPassword);
    await page.fill('[data-testid="new-password-input"]', newPassword);
    await page.click('[data-testid="change-password-button"]');

    // Success toast should appear
    await expect(
      page.getByText(/other devices were signed out/i)
    ).toBeVisible({ timeout: 8_000 });

    // Restore original password so subsequent runs start clean.
    await page.fill('[data-testid="current-password-input"]', newPassword);
    await page.fill('[data-testid="new-password-input"]', currentPassword);
    await page.click('[data-testid="change-password-button"]');
    await expect(page.getByText(/other devices were signed out/i)).toBeVisible({
      timeout: 8_000,
    });
  });

  test("shows error when current password is wrong", async ({ page }) => {
    const email = process.env.E2E_TEST_USER_EMAIL ?? "e2e-user@example.com";
    const currentPassword = process.env.E2E_TEST_USER_PASSWORD ?? "e2e-password";

    await signInAs(page, email, currentPassword);
    await page.goto(ACCOUNT_SECURITY_URL);

    await page.fill('[data-testid="current-password-input"]', "definitely-wrong-password");
    await page.fill('[data-testid="new-password-input"]', "brandnewpass");
    await page.click('[data-testid="change-password-button"]');

    // H7-locked error string
    await expect(
      page.getByText(/that's not the current password/i)
    ).toBeVisible({ timeout: 8_000 });
  });
});

// ---------------------------------------------------------------------------
// State C: OTP recovery — full 3-step flow
// ---------------------------------------------------------------------------

test.describe("State C — OTP recovery sub-flow", () => {
  test("user can reset password via email code (full 3-step flow)", async ({ page }) => {
    const email = process.env.E2E_TEST_USER_EMAIL ?? "e2e-user@example.com";
    const currentPassword = process.env.E2E_TEST_USER_PASSWORD ?? "e2e-password";

    await signInAs(page, email, currentPassword);
    await page.goto(ACCOUNT_SECURITY_URL);

    // Step 1: click "forgot current password" link
    await page.click('[data-testid="forgot-current-password-link"]');

    // Code is sent — should see the code entry step
    await expect(page.getByLabel(/6-digit code/i)).toBeVisible({ timeout: 8_000 });

    // Step 2: enter the OTP code (in CI, the code must be intercepted from
    // the Supabase inbucket or injected via the test user's email inbox mock)
    const otpCode = process.env.E2E_OTP_CODE ?? "SKIP_OTP";
    if (otpCode === "SKIP_OTP") {
      test.skip();
      return;
    }

    await page.fill('[data-testid="otp-code-input"]', otpCode);
    await page.click('[data-testid="verify-code-button"]');

    // Step 3: new-password step (no current-password field)
    await expect(page.getByLabel(/new password/i)).toBeVisible({ timeout: 8_000 });
    expect(page.getByLabel(/current password/i)).not.toBeVisible;

    const newPassword = `recovered-${Date.now()}`;
    await page.fill('[data-testid="new-password-input"]', newPassword);
    await page.click('[data-testid="change-password-button"]');

    await expect(page.getByText(/other devices were signed out/i)).toBeVisible({
      timeout: 8_000,
    });
  });

  test("cancel from State C returns to State A", async ({ page }) => {
    const email = process.env.E2E_TEST_USER_EMAIL ?? "e2e-user@example.com";
    const currentPassword = process.env.E2E_TEST_USER_PASSWORD ?? "e2e-password";

    await signInAs(page, email, currentPassword);
    await page.goto(ACCOUNT_SECURITY_URL);

    // Trigger State C
    await page.click('[data-testid="forgot-current-password-link"]');
    await expect(page.getByLabel(/6-digit code/i)).toBeVisible({ timeout: 8_000 });

    // Cancel
    await page.click('[data-testid="cancel-otp-recovery-link"]');

    // Should return to State A — current-password field visible again
    await expect(
      page.getByLabel(/current password/i)
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Session revocation: cross-device verification
// ---------------------------------------------------------------------------

test.describe("session revocation — other-devices sign-out", () => {
  test("after password change, another browser context is signed out", async ({
    browser,
  }) => {
    const email = process.env.E2E_TEST_USER_EMAIL ?? "e2e-user@example.com";
    const currentPassword = process.env.E2E_TEST_USER_PASSWORD ?? "e2e-password";
    const newPassword = `revoke-test-${Date.now()}`;

    // Context A: the "other device" — signs in first
    const contextA: BrowserContext = await browser.newContext();
    const pageA: Page = await contextA.newPage();
    await signInAs(pageA, email, currentPassword);
    // Verify pageA is properly authed by navigating to /trips
    await pageA.goto("/trips");
    await expect(pageA).not.toHaveURL(/\/login/);

    // Context B: the "current device" — signs in and changes password
    const contextB: BrowserContext = await browser.newContext();
    const pageB: Page = await contextB.newPage();
    await signInAs(pageB, email, currentPassword);
    await pageB.goto(ACCOUNT_SECURITY_URL);

    await pageB.fill('[data-testid="current-password-input"]', currentPassword);
    await pageB.fill('[data-testid="new-password-input"]', newPassword);
    await pageB.click('[data-testid="change-password-button"]');
    await expect(pageB.getByText(/other devices were signed out/i)).toBeVisible({
      timeout: 8_000,
    });

    // Context A should now be signed out (session revoked by signOut({scope:'others'}))
    await pageA.goto("/trips");
    await expect(pageA).toHaveURL(/\/login/, { timeout: 8_000 });

    // Context B stays signed in (the current session is preserved)
    await pageB.goto("/trips");
    await expect(pageB).not.toHaveURL(/\/login/);

    // Cleanup: restore original password
    await contextA.close();
    await pageB.goto(ACCOUNT_SECURITY_URL);
    await pageB.fill('[data-testid="current-password-input"]', newPassword);
    await pageB.fill('[data-testid="new-password-input"]', currentPassword);
    await pageB.click('[data-testid="change-password-button"]');
    await contextB.close();
  });
});
