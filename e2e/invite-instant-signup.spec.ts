/**
 * Playwright E2E — instant-session invite signup (2026-07-11 incident fix).
 *
 * The journey the incident broke, end to end, with NO email round-trip:
 *   fresh email → /invite/[token] → create-account-first password step →
 *   Create account (instant session under local autoconfirm) → land back on
 *   the invite preview → accept → trip visible.
 *
 * What this pins down:
 *   - The invite surface leads with create-account voice (header +
 *     "Create account" primary) instead of the crossed sign-in labels
 *     that misdirected the 2026-07-11 invitees.
 *   - signUpAction succeeds for a brand-new address and reports success
 *     (the incident reported every successful signup as a "network"
 *     failure via the session-less markPasswordSet write).
 *   - The post-auth redirect honors `next` — back to THIS invite preview,
 *     never the empty /trips dashboard.
 *
 * Requires local Supabase (autoconfirm: config.toml enable_confirmations =
 * false) + service-role key, mirroring invite-inline-auth.spec.ts. Each
 * test seeds its own trip/invite and mints a unique invitee email; both
 * are cleaned up afterwards.
 */

import { test, expect } from "@playwright/test";

import {
  cleanupSeededTrip,
  hasServiceRoleKey,
  seedTripAndInvite,
} from "./_setup/seed-invite";
import { cleanupUserByEmail } from "./_setup/cleanup-user";

const SEED_TRIP_NAME = "Instant Signup Smoke";
const SEED_HOST_DISPLAY_NAME = "Carl";
const INVITEE_PASSWORD = "fresh-invitee-pass";

test.describe("invite — fresh invitee creates an account with an instant session", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.skip(
    !hasServiceRoleKey(),
    "Service-role key not configured — instant-signup spec needs a real seeded invite."
  );

  let token: string;
  let tripId: string;
  let inviteeEmail: string;

  test.beforeEach(async ({ request }) => {
    const seeded = await seedTripAndInvite(request, {
      tripName: SEED_TRIP_NAME,
      hostDisplayName: SEED_HOST_DISPLAY_NAME,
    });
    token = seeded.token;
    tripId = seeded.tripId;
    // Unique per run — this address must NOT exist yet (the whole point).
    inviteeEmail = `fresh-invitee-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}@example.com`;
  });

  test.afterEach(async () => {
    await cleanupSeededTrip(tripId);
    await cleanupUserByEmail(inviteeEmail);
  });

  test("create account → instant session → back on invite → accept → trip visible", async ({
    page,
  }) => {
    await page.goto(`/invite/${token}`);

    // Create-account-first surface: the intent-aware header leads with
    // create voice, not "Sign in to join".
    await expect(page.getByText(SEED_TRIP_NAME)).toBeVisible();
    await expect(page.getByText("Make an account to join")).toBeVisible();

    await page.getByLabel("Email").fill(inviteeEmail);
    await page.getByRole("button", { name: "Continue", exact: true }).click();

    // Password step: primary is CREATE ("Create account"), with the
    // sign-in escape hatch as secondary — never a "Sign in" primary over
    // create-account helper text.
    await expect(page.getByLabel("Password")).toBeVisible();
    const createBtn = page.getByRole("button", {
      name: "Create account",
      exact: true,
    });
    await expect(createBtn).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Have an account? Sign in" })
    ).toBeVisible();
    await expect(page.getByLabel("Password")).toHaveAttribute(
      "autocomplete",
      "new-password"
    );

    await page.getByLabel("Password").fill(INVITEE_PASSWORD);
    await createBtn.click();

    // Instant session (autoconfirm) — no email round-trip. We land back on
    // the invite PREVIEW (`next` honored; never the empty /trips
    // dashboard), now rendering the authed accept CTA.
    await expect(page).toHaveURL(new RegExp(`/invite/${token}$`), {
      timeout: 10_000,
    });
    const acceptBtn = page.getByRole("button", { name: /count me in/i });
    await expect(acceptBtn).toBeVisible();
    await expect(page.getByLabel("Email")).not.toBeVisible();

    // Accept — POST route redirects to /trips/<slug>; the trip is visible.
    await page.getByLabel(/what should the crew call you/i).fill("Fresh Nate");
    await acceptBtn.click();
    await expect(page).toHaveURL(/\/trips\/[^/]+$/, { timeout: 10_000 });
    await expect(
      page.getByText(SEED_TRIP_NAME).first()
    ).toBeVisible();
  });

  test("returning invitee can toggle to the sign-in branch", async ({ page }) => {
    await page.goto(`/invite/${token}`);
    await page.getByLabel("Email").fill(inviteeEmail);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByLabel("Password")).toBeVisible();

    // Toggle flips header, primary button, and autocomplete together —
    // labels never cross.
    await page.getByRole("button", { name: "Have an account? Sign in" }).click();
    await expect(
      page.getByRole("button", { name: "Sign in", exact: true })
    ).toBeVisible();
    await expect(page.getByText("Sign in to join")).toBeVisible();
    await expect(page.getByLabel("Password")).toHaveAttribute(
      "autocomplete",
      "current-password"
    );
    // Tertiary code link survives on both branches.
    await expect(
      page.getByRole("button", { name: "Email me a code instead" })
    ).toBeVisible();
  });
});
