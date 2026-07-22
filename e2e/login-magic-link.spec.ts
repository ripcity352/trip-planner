/**
 * Playwright smoke for `/login` email-code (OTP) request.
 *
 * Magic-link URLs were demoted to a verification primitive in M5 PR3 — the
 * login form defaults to password/OTP mode, and "sending the link" now
 * means requesting a 6-digit code via the "Email me a code instead" link.
 * Filename kept as `login-magic-link.spec.ts` (issue #456 references it),
 * but the flow under test is the OTP request, not a magic-link button.
 *
 * requestEmailCode is a Server Action — its call to Supabase's OTP
 * endpoint happens on the Next.js server, not in the browser page
 * context, so a `page.route()` intercept never sees it (verified: the
 * request goes through to the real local Supabase instance regardless
 * of any browser-side route handler). We use the deterministic seeded
 * test user (`TEST_USER_EMAIL`, provisioned by the `setup` project this
 * spec depends on — see playwright.config.ts) so the request succeeds
 * against a real account instead of hitting the `auth_no_account` path.
 *
 * The `chromium` + `mobile-safari` projects run in parallel workers and
 * would otherwise both fire a real OTP request for the same seeded email
 * within the same instant — that trips the AUTH_OTP_VERIFY rate limiter
 * (10/15min per email, lib/rate-limit/index.ts) as a burst, not a genuine
 * abuse pattern, producing a flaky "Easy, tiger..." failure. Restrict the
 * OTP-request assertion to a single project so it exercises the real
 * rate-limited action exactly once per run.
 */

import { test, expect } from "@playwright/test";

import { AUTH_COPY } from "../lib/copy/auth";
import { TEST_USER_EMAIL } from "./_setup/seed-test-user";

const SUCCESS_COPY = AUTH_COPY.codeSentHelper(TEST_USER_EMAIL);

test.describe("login — email code request", () => {
  test.use({
    viewport: { width: 375, height: 812 }, // iPhone-class width
  });

  test("requesting a code shows the code-sent copy", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "single-project guard — avoids a cross-project OTP rate-limit race (see file header)"
    );

    await page.goto("/login");

    await expect(
      page.getByRole("heading", { name: /sign in/i })
    ).toBeVisible();

    // Email → Continue advances to password mode.
    await page.getByLabel(/email/i).fill(TEST_USER_EMAIL);
    await page.getByRole("button", { name: /continue/i }).click();

    // Password mode surfaces the "Email me a code instead" fallback.
    await page.getByRole("button", { name: /email me a code instead/i }).click();

    // Code-sent copy lands; form advances to code-verify mode.
    await expect(page.getByText(SUCCESS_COPY)).toBeVisible();
  });

  test("error query param renders the auth_failed note", async ({ page }) => {
    await page.goto("/login?error=auth");
    await expect(
      page.getByText("Link's stale. Hop back to /login and try again.")
    ).toBeVisible();
  });
});
