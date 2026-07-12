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
 *
 * Seeding note (F10 #4): `invite_preview` is fetched SERVER-side in
 * `app/invite/[token]/page.tsx` (a Server Component using an anonymous
 * Supabase client at render time, not a browser fetch). `page.route()`
 * only intercepts BROWSER-issued requests, so mocking
 * `**\/rest/v1/rpc/invite_preview**` never actually short-circuits the
 * server render — a hardcoded, non-existent token 404s regardless of the
 * route stub. We seed a real invite row via the service-role key instead
 * (`e2e/_setup/seed-invite.ts`), mirroring `invite-flow.spec.ts`. Each
 * test seeds its own trip/invite so runs stay independent and
 * self-cleaning.
 */

import { test, expect } from "@playwright/test";

import {
  cleanupSeededTrip,
  hasServiceRoleKey,
  seedTripAndInvite,
} from "./_setup/seed-invite";
import { TEST_USER_EMAIL, TEST_USER_PASSWORD } from "./_setup/seed-test-user";

const SEED_TRIP_NAME = "Dave's Bach";
const SEED_HOST_DISPLAY_NAME = "Carl";

test.describe("invite preview — inline auth for anonymous viewer", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.skip(
    !hasServiceRoleKey(),
    "Service-role key not configured — inline-auth specs need a real seeded invite."
  );

  let token: string;
  let tripId: string;

  test.beforeEach(async ({ request }) => {
    const seeded = await seedTripAndInvite(request, {
      tripName: SEED_TRIP_NAME,
      hostDisplayName: SEED_HOST_DISPLAY_NAME,
    });
    token = seeded.token;
    tripId = seeded.tripId;
  });

  test.afterEach(async () => {
    await cleanupSeededTrip(tripId);
  });

  test("anonymous viewer sees inline LoginForm instead of redirect link", async ({
    page,
  }) => {
    await page.goto(`/invite/${token}`);

    // Trip details visible
    await expect(page.getByText(SEED_TRIP_NAME)).toBeVisible();

    // LoginForm is rendered inline — email field present
    await expect(page.getByLabel("Email")).toBeVisible();

    // Old "Sign in to join" link (which pointed to /login?next=...) must NOT exist
    const oldLink = page.getByRole("link", { name: "Sign in to join" });
    await expect(oldLink).not.toBeVisible();
  });

  test("inline LoginForm has a Continue button in initial state", async ({
    page,
  }) => {
    await page.goto(`/invite/${token}`);
    await expect(
      page.getByRole("button", { name: "Continue", exact: true })
    ).toBeVisible();
  });

  test("submitting password in inline form signs in and reveals the accept CTA", async ({
    page,
  }) => {
    // `signInWithPasswordAction` is a Server Action (app/login/actions.ts,
    // "use server") — the Supabase call happens in the Next.js server
    // process, never as a browser-issued request, so `page.route()` can't
    // intercept it (see the file-header note). We drive this for real
    // against the seeded fixture user instead of mocking.
    //
    // Also: `LoginForm`'s `next` prop here is `invitePreviewPath(token)` —
    // the GET-navigable preview page, NOT the POST-only
    // `/invite/<token>/accept` route (#316 — see CLAUDE.md "Invite
    // redirect contract"). The original version of this test asserted a
    // redirect straight to `/accept`, which the app never does; the
    // correct signal is: back on the preview page, now rendering the
    // signed-in "accept" CTA instead of the login form.
    await page.goto(`/invite/${token}`);
    await expect(page.getByLabel("Email")).toBeVisible();

    await page.getByLabel("Email").fill(TEST_USER_EMAIL);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByLabel("Password")).toBeVisible();
    // 2026-07-11 incident fix: the invite surface is create-account-first.
    // A returning user reaches the sign-in branch via the secondary toggle.
    await page
      .getByRole("button", { name: "Have an account? Sign in" })
      .click();
    await page.getByLabel("Password").fill(TEST_USER_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    // On successful sign-in we land back on the preview URL (not /accept)...
    await expect(page).toHaveURL(new RegExp(`/invite/${token}$`), {
      timeout: 8000,
    });
    // ...now rendering the authed "Count me in" accept CTA instead of the
    // login form.
    await expect(
      page.getByRole("button", { name: /count me in/i })
    ).toBeVisible();
    await expect(page.getByLabel("Email")).not.toBeVisible();
  });

  test("inline LoginForm 'Email me a code instead' stays on the invite page", async ({
    page,
  }) => {
    // Same real-backend note as above — OTP sign-in can't create
    // accounts, so this must be a real, already-registered user.
    await page.goto(`/invite/${token}`);
    await page.getByLabel("Email").fill(TEST_USER_EMAIL);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByLabel("Password")).toBeVisible();
    await page.getByRole("button", { name: "Email me a code instead" }).click();

    // Should transition to code-verify mode on the same page
    await expect(page.getByLabel("6-digit code")).toBeVisible();
    // URL should still be on the invite page, not redirected to /login
    await expect(page).toHaveURL(new RegExp(`/invite/${token}`));
    await expect(page).not.toHaveURL(/\/login/);
  });
});
