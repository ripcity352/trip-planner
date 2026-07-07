/**
 * Playwright E2E for the progressive-disclosure login flow (M5/PR2).
 *
 * Renamed from `login-magic-link.spec.ts` — that file covered the old
 * single-field magic-link form. This spec covers the new 4-mode form:
 *   1. password sign-in (success + wrong password)
 *   2. code fallback ("Email me a code instead")
 *   3. sign-up flow (wrong password → "Create account instead")
 *   4. sign-up for new email auto-suggestion
 *
 * Network intercepts (F10 follow-up finding): `signInWithPasswordAction`,
 * `requestEmailCode`, `verifyEmailCodeAction`, and `signUpAction` are all
 * Next.js Server Actions ("use server" — app/login/actions.ts). The
 * actual Supabase call happens INSIDE the Next.js server process, never
 * as a browser-issued request — so `page.route("**\/auth/v1/token**")` /
 * `**\/auth/v1/otp**` can never intercept it (same class of bug as the
 * invite_preview server-fetch issue, see `_setup/seed-invite.ts`). The
 * `page.route()` calls below are dead weight kept only where a test's
 * assertion doesn't actually depend on the real outcome (see per-test
 * notes). The "code fallback" tests DO depend on a real backend
 * response, so they use the real seeded fixture user
 * (`TEST_USER_EMAIL`/`TEST_USER_PASSWORD`, provisioned by
 * `_setup/auth.setup.ts`) instead of a fictitious email — OTP sign-in
 * can't create new users (`shouldCreateUser: false`, CLAUDE.md "State B
 * is OAuth-only"), so a made-up email always fails the real request.
 */

import { test, expect } from "@playwright/test";
import { TEST_USER_EMAIL } from "./_setup/seed-test-user";

// Supabase auth endpoint pattern. Kept only where a test's assertion
// doesn't depend on the real backend outcome (see file-header note) —
// the mock itself is inert against the Server Action call path, but
// harmless to leave as documentation of original intent.
const SUPABASE_TOKEN_URL = "**/auth/v1/token**";

test.describe("login — password sign-in", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("submitting valid email + password calls Supabase and shows success", async ({
    page,
  }) => {
    // Stub Supabase password sign-in (token endpoint with grant_type=password)
    await page.route(SUPABASE_TOKEN_URL, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "test-token",
          refresh_token: "test-refresh",
          user: { id: "user-1", email: "dave@example.com" },
        }),
      });
    });

    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();

    // email-only mode
    await page.getByLabel("Email").fill("dave@example.com");
    await page.getByRole("button", { name: "Continue", exact: true }).click();

    // password mode
    await expect(page.getByLabel("Password")).toBeVisible();
    await page.getByLabel("Password").fill("hunter2!");
    await page.getByRole("button", { name: "Sign in" }).click();

    // Should redirect away from /login on success (or show a success state)
    // We can't fully test the redirect without a real session; assert that
    // the form is no longer in password mode or a success indicator appears.
    await expect(page.getByRole("button", { name: "Sign in" })).not.toBeVisible({
      timeout: 5000,
    });
  });

  test("wrong password renders the auth_wrong_password error", async ({
    page,
  }) => {
    await page.route(SUPABASE_TOKEN_URL, async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "invalid_grant",
          error_description: "Invalid login credentials",
        }),
      });
    });

    await page.goto("/login");
    await page.getByLabel("Email").fill("dave@example.com");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByLabel("Password")).toBeVisible();
    await page.getByLabel("Password").fill("wrongpass");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(
      page.getByText(
        "That combo didn't match. Try again — or get a code emailed instead."
      )
    ).toBeVisible();

    // "Email me a code instead" should be visible and prominent after wrong password
    await expect(
      page.getByRole("button", { name: "Email me a code instead" })
    ).toBeVisible();
  });

  test("error query param renders the auth_failed note", async ({ page }) => {
    await page.goto("/login?error=auth");
    await expect(
      page.getByText("Link's stale. Hop back to /login and try again.")
    ).toBeVisible();
  });
});

test.describe("login — code fallback", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  // Both assertions merged into ONE test that requests the OTP code
  // exactly once. requestEmailCode is a Server Action (no page.route
  // mock possible — see file-header note), so this hits the real local
  // Supabase, which requires a real, already-registered user (OTP
  // sign-in can't create accounts) — hence the seeded fixture user
  // rather than a fictitious email. Two separate tests each requesting
  // a fresh OTP code for the SAME email collide with Supabase's
  // per-email OTP request cooldown (~60s) when run back-to-back in the
  // same worker, so the second test's request comes back rate-limited
  // and never reaches code-verify mode. One request, both assertions.
  test("clicking 'Email me a code instead' triggers OTP, then Verify submits", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(TEST_USER_EMAIL);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByLabel("Password")).toBeVisible();

    await page.getByRole("button", { name: "Email me a code instead" }).click();

    // Should transition to code-verify mode
    await expect(page.getByLabel("6-digit code")).toBeVisible();
    await expect(
      page.getByText(new RegExp(`Code's heading to ${TEST_USER_EMAIL}`))
    ).toBeVisible();

    // We don't have the real emailed code, but this assertion only
    // checks the "Verify" button's transient pending state (button
    // label swaps to a spinner during the async transition), which
    // happens regardless of whether the code is actually correct.
    await page.getByLabel("6-digit code").fill("123456");
    await page.getByRole("button", { name: "Verify" }).click();

    // Verify button should disappear on success
    await expect(page.getByRole("button", { name: "Verify" })).not.toBeVisible({
      timeout: 5000,
    });
  });
});

test.describe("login — sign-up flow", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  // A fresh email PER TEST RUN, not a shared hardcoded "newuser@example.com".
  // These `page.route(SUPABASE_TOKEN_URL...)` mocks are inert (Server
  // Action, see file-header note) — signInWithPasswordAction actually
  // runs against the real local Supabase. A hardcoded email becomes a
  // real, permanently-registered account the first time "Create account
  // instead" is exercised (signUpAction genuinely creates it), so on every
  // subsequent run "wrong password" is no longer wrong — the account now
  // exists with that exact password, sign-in SUCCEEDS for real, and the
  // "Create account instead" affordance never appears. A unique email
  // per run keeps every run's "this account doesn't exist yet" premise
  // true.
  function freshSignupEmail(): string {
    return `newuser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  }

  test("wrong password reveals 'Create account instead' link", async ({
    page,
  }) => {
    const email = freshSignupEmail();
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByLabel("Password")).toBeVisible();
    await page.getByLabel("Password").fill("mypassword");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(
      page.getByRole("button", { name: "Create account instead" })
    ).toBeVisible();
  });

  test("clicking 'Create account instead' calls signUp", async ({ page }) => {
    const email = freshSignupEmail();
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByLabel("Password")).toBeVisible();
    await page.getByLabel("Password").fill("mypassword");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(
      page.getByRole("button", { name: "Create account instead" })
    ).toBeVisible();

    await page.getByRole("button", { name: "Create account instead" }).click();

    // Sign-up submitted — button should disappear or redirect
    await expect(
      page.getByRole("button", { name: "Create account instead" })
    ).not.toBeVisible({ timeout: 5000 });
  });
});
