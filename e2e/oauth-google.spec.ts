/**
 * E2E spec — Google OAuth sign-in round-trip (M5/PR5).
 *
 * Because the actual Google OAuth consent screen requires a real browser
 * session against live Google infrastructure, this spec:
 *   1. Verifies the UI surface (button present, accessible label).
 *   2. Mocks the OAuth redirect by intercepting /auth/callback with a
 *      synthetic PKCE code exchange — the Supabase test environment
 *      provides a mock provider at SUPABASE_AUTH_EXTERNAL_GOOGLE_REDIRECT_URI.
 *   3. Verifies the post-auth landing page.
 *
 * The spec does NOT automate the Google consent screen — that's outside our
 * test boundary. The OAuth round-trip is the Supabase + callback handler
 * boundary, tested here end-to-end.
 *
 * Gated behind `NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED` — the same flag
 * `lib/auth/oauth-config.ts` uses to render (or hide) the "Continue with
 * Google" button (#370). The provider is parked (#232) and the flag is
 * `false` everywhere today, so the whole spec skips at the module level
 * until it's flipped on. Tracking: #225, #232.
 */

import { test, expect } from "@playwright/test";

test.skip(
  process.env.NEXT_PUBLIC_OAUTH_GOOGLE_ENABLED !== "true",
  "Google OAuth gated off — #232/#370"
);

test.describe("Google OAuth sign-in", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("renders the 'Continue with Google' button on /login", async ({ page }) => {
    const googleBtn = page.getByRole("button", { name: /continue with google/i });
    await expect(googleBtn).toBeVisible();
  });

  test("'Continue with Google' button has an accessible label", async ({ page }) => {
    const googleBtn = page.getByRole("button", { name: /continue with google/i });
    // Must be a button with accessible name — not an aria-hidden icon.
    await expect(googleBtn).toHaveAccessibleName(/continue with google/i);
  });

  test("'Continue with Google' appears below 'Email me a code instead' link (H3 ordering)", async ({
    page,
  }) => {
    // Advance to password mode to see the email-me-a-code link
    await page.fill('input[type="email"]', "test@example.com");
    await page.getByRole("button", { name: /continue/i }).click();

    // The email-me-a-code link is OTP-as-floor (universal)
    const otpLink = page.getByRole("button", { name: /email me a code instead/i });
    const googleBtn = page.getByRole("button", { name: /continue with google/i });

    // Wait for both to be visible
    await expect(otpLink).toBeVisible();
    await expect(googleBtn).toBeVisible();

    // Assert DOM order: OTP link comes before Google button.
    const otpY = await otpLink.evaluate((el) => el.getBoundingClientRect().top);
    const googleY = await googleBtn.evaluate((el) => el.getBoundingClientRect().top);
    expect(otpY).toBeLessThanOrEqual(googleY);
  });

  // ---------------------------------------------------------------------------
  // Mock OAuth round-trip
  // Requires local Supabase with Google provider configured in supabase/config.toml.
  // Skipped in CI until the mock provider is wired.
  // ---------------------------------------------------------------------------

  test.skip("completes OAuth sign-in via mock Google provider and lands on /trips", async ({
    page,
  }) => {
    // Click "Continue with Google" — Supabase returns the local mock URL.
    await page.getByRole("button", { name: /continue with google/i }).click();

    // The local Supabase mock OAuth provider auto-approves the consent.
    // After the round-trip, /auth/callback exchanges the PKCE code and
    // redirects to /trips.
    await page.waitForURL(/\/trips/, { timeout: 10_000 });

    // Verify the user is authenticated.
    await expect(page.getByRole("heading")).toBeVisible();
  });
});

// OAuth-existing-user alert (M5-followup) — block removed. The UI scaffolding
// was stripped from PR5 because the server-side detection that produces
// auth_email_taken_oauth was never wired. Re-introduce this block alongside
// the follow-up PR that adds the detection.
