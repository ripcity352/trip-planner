/**
 * Playwright E2E for the inline-auth on the invite preview page (M5/PR2).
 *
 * Before PR2, an anonymous viewer at `/invite/[token]` was bounced to
 * `/login?next=/invite/<token>/accept`. After PR2, the LoginForm renders
 * inline below the invite card so the user never leaves the page.
 *
 * This spec verifies:
 *   1. Anonymous viewer sees the invite preview + inline LoginForm
 *   2. The bounced `/login?next=` link is gone
 *   3. Submitting the password form redirects to `/invite/<token>/accept`
 */

import { test, expect } from "@playwright/test";

// Synthetic invite-preview RPC response
const MOCK_PREVIEW = {
  trip_name: "Dave's Bach",
  host_display_name: "Carl",
  starts_at: "2026-07-04T00:00:00.000Z",
  ends_at: "2026-07-06T00:00:00.000Z",
  attendee_count_bucket: "small-crew",
};

test.describe("invite preview — inline auth for anonymous viewer", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    // Stub the invite_preview RPC so the page renders without real data
    await page.route("**/rest/v1/rpc/invite_preview**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_PREVIEW),
      });
    });
  });

  test("anonymous viewer sees inline LoginForm instead of redirect link", async ({
    page,
  }) => {
    await page.goto("/invite/test-token-123");

    // Trip details visible
    await expect(page.getByRole("heading", { name: "Dave's Bach" })).toBeVisible();

    // LoginForm is rendered inline — email field present
    await expect(page.getByLabel("Email")).toBeVisible();

    // Old "Sign in to join" link (which pointed to /login?next=...) must NOT exist
    const oldLink = page.getByRole("link", { name: "Sign in to join" });
    await expect(oldLink).not.toBeVisible();
  });

  test("inline LoginForm has a Continue button in initial state", async ({
    page,
  }) => {
    await page.goto("/invite/test-token-123");
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  });

  test("submitting password in inline form redirects to /invite/<token>/accept", async ({
    page,
  }) => {
    // Stub Supabase password sign-in
    await page.route("**/auth/v1/token**", async (route) => {
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

    await page.goto("/invite/test-token-123");
    await expect(page.getByLabel("Email")).toBeVisible();

    await page.getByLabel("Email").fill("dave@example.com");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByLabel("Password")).toBeVisible();
    await page.getByLabel("Password").fill("hunter2!");
    await page.getByRole("button", { name: "Sign in" }).click();

    // On successful sign-in the next URL should be /invite/test-token-123/accept
    await expect(page).toHaveURL(/\/invite\/test-token-123\/accept/, {
      timeout: 8000,
    });
  });

  test("inline LoginForm 'Email me a code instead' stays on the invite page", async ({
    page,
  }) => {
    await page.route("**/auth/v1/otp**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: null, error: null }),
      });
    });

    await page.goto("/invite/test-token-123");
    await page.getByLabel("Email").fill("dave@example.com");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByLabel("Password")).toBeVisible();
    await page.getByRole("button", { name: "Email me a code instead" }).click();

    // Should transition to code-verify mode on the same page
    await expect(page.getByLabel("6-digit code")).toBeVisible();
    // URL should still be on the invite page, not redirected to /login
    await expect(page).toHaveURL(/\/invite\/test-token-123/);
    await expect(page).not.toHaveURL(/\/login/);
  });
});
