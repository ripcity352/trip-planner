/**
 * Playwright smoke for the RSVP toggle + glanceable count (#74).
 *
 * Scope:
 *   - Authenticated user visits `/trips/<slug>`
 *   - Dashboard renders the RSVP chip group with the right initial state
 *   - Clicking "Maybe" persists; a reload shows the same state
 *
 * Auth fixture caveat: we don't have a reusable storage-state auth
 * setup yet for mobile-safari. The authenticated portion of this spec
 * is marked `test.fixme()` until that lands; we still ship the
 * unauthenticated-redirect smoke so a regression on the page guard is
 * caught. Tracking the auth-fixture follow-up in the PR body.
 */

import { test, expect, type APIRequestContext } from "@playwright/test";

import { M2_UI_STRINGS } from "@/lib/copy/empty-states";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

test.describe("RSVP dashboard wiring", () => {
  test.use({
    viewport: { width: 375, height: 812 },
  });

  test("unauthenticated visit to /trips/<slug> is bounced by the authed layout", async ({
    page,
  }) => {
    // The (authed) route group enforces session presence — an
    // unauthenticated request should be redirected to /login. We don't
    // assert the exact target (the auth layer may evolve); we assert
    // that the dashboard heading is NOT rendered, which is the
    // load-bearing observable: a logged-out user must not see RSVP
    // chips for any trip.
    await page.goto("/trips/any-slug");

    await expect(
      page.getByText(M2_UI_STRINGS.dashboard_section_rsvp_heading)
    ).not.toBeVisible();
  });

  test.fixme(
    "authenticated user can change RSVP and the state persists across reload",
    async ({ page, request }) => {
      test.skip(
        !SUPABASE_URL || !SERVICE_ROLE_KEY,
        "Service-role key not configured — skipping authenticated RSVP path."
      );

      // When the auth fixture lands, this block seeds a trip + member
      // for the test user via service role, then drives the toggle.
      const slug = await seedTripWithMember(request);
      await page.goto(`/trips/${slug}`);

      const goingChip = page.getByRole("button", {
        name: M2_UI_STRINGS.rsvp_chip_going,
      });
      const maybeChip = page.getByRole("button", {
        name: M2_UI_STRINGS.rsvp_chip_maybe,
      });

      await expect(goingChip).toBeVisible();
      await maybeChip.click();
      await expect(maybeChip).toHaveAttribute("aria-pressed", "true");

      await page.reload();
      await expect(
        page.getByRole("button", { name: M2_UI_STRINGS.rsvp_chip_maybe })
      ).toHaveAttribute("aria-pressed", "true");
    }
  );
});

/**
 * Service-role REST helper: seed a trip + organizer membership for the
 * test user. Bypasses RLS; service-role only. Mirrors the seed shape
 * used by e2e/invite-flow.spec.ts but adapted for the RSVP test —
 * member rsvp_status starts as 'pending'.
 *
 * Returns the trip's slug.
 */
async function seedTripWithMember(
  request: APIRequestContext
): Promise<string> {
  const headers = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  const slug = `rsvp-smoke-${Date.now().toString(36)}`;

  // Mint or reuse a seed user. The real auth-fixture wiring lands later;
  // for now this gets the test ready for the day the fixture exists.
  const listResp = await request.get(
    `${SUPABASE_URL}/auth/v1/admin/users?per_page=1`,
    { headers }
  );
  let ownerId: string | null = null;
  if (listResp.ok()) {
    const body = (await listResp.json()) as {
      users?: Array<{ id: string }>;
    };
    if (body.users && body.users.length > 0) {
      ownerId = body.users[0].id;
    }
  }
  if (!ownerId) {
    const createResp = await request.post(
      `${SUPABASE_URL}/auth/v1/admin/users`,
      {
        headers,
        data: {
          email: `rsvp-smoke+${Date.now()}@example.com`,
          email_confirm: true,
        },
      }
    );
    const created = (await createResp.json()) as { id: string };
    ownerId = created.id;
  }

  const tripResp = await request.post(`${SUPABASE_URL}/rest/v1/trips`, {
    headers,
    data: {
      slug,
      name: "RSVP Smoke",
      created_by: ownerId,
      kind: "bachelor",
    },
  });
  const [trip] = await tripResp.json();

  await request.post(`${SUPABASE_URL}/rest/v1/trip_members`, {
    headers,
    data: {
      trip_id: trip.id,
      user_id: ownerId,
      role: "organizer",
      rsvp_status: "pending",
    },
  });

  return slug;
}
