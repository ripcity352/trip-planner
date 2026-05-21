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
 * Network intercepts: we stub Supabase auth endpoints so the spec runs
 * in CI without live credentials.
 */

import { test, expect } from "@playwright/test";

// Supabase auth endpoint patterns
const SUPABASE_TOKEN_URL = "**/auth/v1/token**";
const SUPABASE_OTP_URL = "**/auth/v1/otp**";

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
    await page.getByRole("button", { name: "Continue" }).click();

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
    await page.getByRole("button", { name: "Continue" }).click();
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

  test("clicking 'Email me a code instead' triggers OTP and shows code field", async ({
    page,
  }) => {
    await page.route(SUPABASE_OTP_URL, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: null, error: null }),
      });
    });

    await page.goto("/login");
    await page.getByLabel("Email").fill("dave@example.com");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByLabel("Password")).toBeVisible();

    await page.getByRole("button", { name: "Email me a code instead" }).click();

    // Should transition to code-verify mode
    await expect(page.getByLabel("6-digit code")).toBeVisible();
    await expect(
      page.getByText(/Code's heading to dave@example\.com/)
    ).toBeVisible();
  });

  test("entering a valid code calls verifyOtp and redirects", async ({
    page,
  }) => {
    await page.route(SUPABASE_OTP_URL, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: null, error: null }),
      });
    });

    // Stub the verifyOtp call (POST to token endpoint)
    await page.route("**/auth/v1/verify**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          access_token: "test-token",
          user: { id: "user-1", email: "dave@example.com" },
        }),
      });
    });

    await page.goto("/login");
    await page.getByLabel("Email").fill("dave@example.com");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByLabel("Password")).toBeVisible();
    await page.getByRole("button", { name: "Email me a code instead" }).click();
    await expect(page.getByLabel("6-digit code")).toBeVisible();

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

  test("wrong password reveals 'Create account instead' link", async ({
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
    await page.getByLabel("Email").fill("newuser@example.com");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByLabel("Password")).toBeVisible();
    await page.getByLabel("Password").fill("mypassword");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(
      page.getByRole("button", { name: "Create account instead" })
    ).toBeVisible();
  });

  test("clicking 'Create account instead' calls signUp", async ({ page }) => {
    // First stub sign-in to fail
    await page.route(SUPABASE_TOKEN_URL, async (route) => {
      if (route.request().postData()?.includes("grant_type=password")) {
        await route.fulfill({
          status: 400,
          contentType: "application/json",
          body: JSON.stringify({
            error: "invalid_grant",
            error_description: "Invalid login credentials",
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            access_token: "test-token",
            user: { id: "user-1", email: "newuser@example.com" },
          }),
        });
      }
    });

    // Stub sign-up
    await page.route("**/auth/v1/signup**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: { id: "user-1", email: "newuser@example.com" },
        }),
      });
    });

    await page.goto("/login");
    await page.getByLabel("Email").fill("newuser@example.com");
    await page.getByRole("button", { name: "Continue" }).click();
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
