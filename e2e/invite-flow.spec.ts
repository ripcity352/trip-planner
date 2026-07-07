/**
 * Playwright smoke for the invite flow (#73).
 *
 * Scope of this spec:
 *   - Logged-out user visits `/invite/<token>`
 *   - If the token resolves, they see the trip name + the inline-auth CTA
 *   - If the token doesn't resolve, the page renders the
 *     "invite_not_found" copy + a link back home
 *
 * Why we don't drive the full accept-path here: that requires a
 * Supabase-emailed magic link + a real auth session. We exercise the
 * happy path of `acceptInviteAction` in `lib/actions/__tests__/...`;
 * the e2e here covers the pre-login UX which is the wedge that decides
 * whether a click converts. The full inline-auth interaction (mode
 * transitions, redirect-on-success) lives in `invite-inline-auth.spec.ts`
 * — this spec only smoke-checks that a valid token renders the preview
 * and the inline form, not the pre-M5 `/login?next=` bounce link.
 *
 * For the "valid token" case we seed a real invite via the service-role
 * key (see `e2e/_setup/seed-invite.ts`). That requires
 * `SUPABASE_SERVICE_ROLE_KEY` at test time. We make the seeding optional:
 * if the key is missing, the spec skips the valid-token assertion and
 * only runs the invalid-token variant. This keeps CI green on dev forks
 * while still catching regressions against the production-shaped env in
 * our own pipeline.
 */

import { test, expect } from "@playwright/test";

import { ERRORS } from "@/lib/copy/errors";
import { hasServiceRoleKey, seedTripAndInvite } from "./_setup/seed-invite";

// Source the assertion string from the copy palette so a microcopy
// rewrite in `lib/copy/errors.ts` doesn't silently break the spec.
const INVITE_NOT_FOUND_COPY = ERRORS.invite_not_found;

test.describe("invite preview (logged-out)", () => {
  test.use({
    viewport: { width: 375, height: 812 },
  });

  test("renders the invite_not_found copy for a token that doesn't exist", async ({
    page,
  }) => {
    // Random UUIDv4 — overwhelmingly unlikely to collide with anything
    // in the local DB.
    const bogus = "00000000-0000-0000-0000-000000000000";

    await page.goto(`/invite/${bogus}`);

    await expect(page.getByText(INVITE_NOT_FOUND_COPY)).toBeVisible();
    // Back-home link is rendered as a button-styled anchor.
    await expect(page.getByRole("link", { name: /back home/i })).toBeVisible();
  });

  test("renders the preview + inline auth for a valid invite token", async ({
    page,
    request,
  }) => {
    test.skip(
      !hasServiceRoleKey(),
      "Service-role key not configured — skipping the valid-invite path."
    );

    // Seed: insert a trip + organizer member + invite via the REST API
    // (service role bypasses RLS). We don't go through the app's create
    // flow here because we want this spec to be independent of the
    // create-trip server action.
    const { token } = await seedTripAndInvite(request);

    await page.goto(`/invite/${token}`);

    // The trip name from the seed is "Bach Smoke Test".
    await expect(page.getByText(/bach smoke test/i)).toBeVisible();

    // M5/PR2 replaced the "Sign in to join" -> /login bounce with an
    // inline LoginForm rendered directly on this page (see
    // invite-inline-auth.spec.ts for the full inline-auth coverage).
    // We only smoke-check the bounce is gone and the form is present here.
    await expect(
      page.getByRole("link", { name: /sign in to join/i })
    ).not.toBeVisible();
    await expect(page.getByLabel("Email")).toBeVisible();
  });
});
