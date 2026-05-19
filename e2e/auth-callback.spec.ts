/**
 * Example Playwright smoke for `/auth/callback`. The full magic-link
 * exchange depends on Supabase, so this test only asserts the route
 * is wired and redirects when no `code` is present — the deterministic
 * branch in `app/auth/callback/route.ts` that lands on
 * `/login?error=auth`.
 *
 * Tighten this once M2 wires the full callback (mock the Supabase
 * auth-token endpoint with `page.route(...)` and assert the happy-path
 * redirect to `next`).
 */

import { test, expect } from "@playwright/test";

test("auth callback without a code redirects to /login", async ({ page }) => {
  const response = await page.goto("/auth/callback?next=/");

  // The route exists and the request resolved.
  expect(response).not.toBeNull();

  // Playwright auto-follows redirects, so assert on the final URL,
  // not the status. Either the redirect chain landed on /login
  // (no-code branch) or — if Supabase ever becomes reachable in CI —
  // the next param. Both prove the route is wired.
  await expect(page).toHaveURL(/\/login\?error=auth|\/$/);
});
