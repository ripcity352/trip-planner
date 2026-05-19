/**
 * Playwright smoke for the invite flow (#73).
 *
 * Scope of this spec:
 *   - Logged-out user visits `/invite/<token>`
 *   - If the token resolves, they see the trip name + the CTA
 *   - The CTA links to `/login?next=/invite/<token>/accept`
 *   - If the token doesn't resolve, the page renders the
 *     "invite_not_found" copy + a link back home
 *
 * Why we don't drive the full accept-path here: that requires a
 * Supabase-emailed magic link + a real auth session. We exercise the
 * happy path of `acceptInviteAction` in `lib/actions/__tests__/...`;
 * the e2e here covers the pre-login UX which is the wedge that decides
 * whether a click converts.
 *
 * For the "valid token" case we'd ideally seed a real invite via the
 * service-role key. That requires `SUPABASE_SERVICE_ROLE_KEY` at test
 * time. We make the seeding optional: if the key is missing, the spec
 * skips the valid-token assertion and only runs the invalid-token
 * variant. This keeps CI green on dev forks while still catching
 * regressions against the production-shaped env in our own pipeline.
 */

import { test, expect, type APIRequestContext } from "@playwright/test";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const INVITE_NOT_FOUND_COPY = "Can't find that invite. Double-check the link.";

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

  test("renders the preview + sign-in CTA for a valid invite token", async ({
    page,
    request,
  }) => {
    test.skip(
      !SUPABASE_URL || !SERVICE_ROLE_KEY,
      "Service-role key not configured — skipping the valid-invite path."
    );

    // Seed: insert a trip + organizer member + invite via the REST API
    // (service role bypasses RLS). We don't go through the app's create
    // flow here because we want this spec to be independent of the
    // create-trip server action.
    const token = await seedTripAndInvite(request);

    await page.goto(`/invite/${token}`);

    // The trip name from the seed is "Bach Smoke Test".
    await expect(page.getByText(/bach smoke test/i)).toBeVisible();
    // The CTA links into the login bounce with the accept URL as `next`.
    const cta = page.getByRole("link", { name: /sign in to join/i });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAttribute(
      "href",
      `/login?next=/invite/${token}/accept`
    );
  });
});

/**
 * Service-role REST helpers: insert a trip + organizer membership + an
 * invite, returning the invite token. Bypasses RLS — service-role only.
 */
async function seedTripAndInvite(request: APIRequestContext): Promise<string> {
  const headers = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  // Use a unique slug each run so reseeds don't collide.
  const slug = `bach-smoke-${Date.now().toString(36)}`;

  // We need an existing auth.users id to satisfy trips.created_by /
  // trip_members.user_id FKs. Service role can mint one via the admin
  // API; we shortcut by trying to find any existing user first.
  const { ownerId } = await ensureSeedUser(request, headers);

  const tripResp = await request.post(`${SUPABASE_URL}/rest/v1/trips`, {
    headers,
    data: {
      slug,
      name: "Bach Smoke Test",
      created_by: ownerId,
      kind: "bachelor",
    },
  });
  if (!tripResp.ok()) {
    throw new Error(
      `seed: insert trips failed (${tripResp.status()}): ${await tripResp.text()}`
    );
  }
  const [trip] = await tripResp.json();

  // Organizer membership for the seed user.
  await request.post(`${SUPABASE_URL}/rest/v1/trip_members`, {
    headers,
    data: {
      trip_id: trip.id,
      user_id: ownerId,
      role: "organizer",
      rsvp_status: "going",
    },
  });

  const inviteResp = await request.post(`${SUPABASE_URL}/rest/v1/invites`, {
    headers,
    data: { trip_id: trip.id, created_by: ownerId, uses_left: null },
  });
  if (!inviteResp.ok()) {
    throw new Error(
      `seed: insert invites failed (${inviteResp.status()}): ${await inviteResp.text()}`
    );
  }
  const [invite] = await inviteResp.json();
  return invite.token as string;
}

/**
 * Best-effort: reuse the first user we find, otherwise mint one via
 * the admin API. Idempotent enough for repeated local runs.
 */
async function ensureSeedUser(
  request: APIRequestContext,
  headers: Record<string, string>
): Promise<{ ownerId: string }> {
  const listResp = await request.get(
    `${SUPABASE_URL}/auth/v1/admin/users?per_page=1`,
    {
      headers,
    }
  );
  if (listResp.ok()) {
    const body = (await listResp.json()) as {
      users?: Array<{ id: string }>;
    };
    if (body.users && body.users.length > 0) {
      return { ownerId: body.users[0].id };
    }
  }

  const createResp = await request.post(`${SUPABASE_URL}/auth/v1/admin/users`, {
    headers,
    data: {
      email: `smoke+${Date.now()}@example.com`,
      email_confirm: true,
    },
  });
  if (!createResp.ok()) {
    throw new Error(
      `seed: admin user create failed (${createResp.status()}): ${await createResp.text()}`
    );
  }
  const created = (await createResp.json()) as { id: string };
  return { ownerId: created.id };
}
