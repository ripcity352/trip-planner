/**
 * seed-invite.ts
 *
 * Shared service-role seeding for specs that need a REAL invite row
 * (trip + organizer membership + invite token) rather than mocking the
 * `invite_preview` RPC.
 *
 * Why this exists (F10 #4): `invite_preview` is fetched SERVER-side in
 * `app/invite/[token]/page.tsx` (a Server Component calling the RPC via
 * an anonymous Supabase client at render time). `page.route()` only
 * intercepts requests made from the BROWSER's network stack, so mocking
 * `**\/rest/v1/rpc/invite_preview**` never actually intercepts anything —
 * the server-rendered HTML always reflects the real DB state. A
 * hardcoded, non-existent token (e.g. "test-token-123") therefore always
 * 404s. The fix is to seed a real row via the service-role key (same
 * pattern `invite-flow.spec.ts` already used) and drive the spec against
 * that.
 *
 * Extracted from `invite-flow.spec.ts` so `invite-inline-auth.spec.ts`
 * doesn't duplicate the same REST plumbing (DRY).
 */

import type { APIRequestContext } from "@playwright/test";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function hasServiceRoleKey(): boolean {
  return Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);
}

export interface SeedInviteOptions {
  /** Trip name to seed. Defaults to a unique "Bach Smoke Test <ts>" name. */
  tripName?: string;
  /**
   * Display name for the organizer/host — surfaces as `host_display_name`
   * in `invite_preview` via `trip_members.display_name`.
   */
  hostDisplayName?: string;
}

export interface SeedInviteResult {
  token: string;
  tripId: string;
  ownerId: string;
}

/**
 * Insert a trip + organizer membership + invite via the REST API
 * (service role bypasses RLS), returning the invite token. Bypasses the
 * app's create-trip server action on purpose — these specs test the
 * invite-preview / inline-auth surface independently of trip creation.
 */
export async function seedTripAndInvite(
  request: APIRequestContext,
  opts: SeedInviteOptions = {}
): Promise<SeedInviteResult> {
  if (!hasServiceRoleKey()) {
    throw new Error(
      "seed-invite: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
    );
  }

  const headers = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };

  // Unique slug each run so reseeds don't collide.
  const slug = `bach-smoke-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const tripName = opts.tripName ?? "Bach Smoke Test";
  const hostDisplayName = opts.hostDisplayName ?? "Smoke Host";

  const ownerId = await ensureSeedUser(request, headers);

  const tripResp = await request.post(`${SUPABASE_URL}/rest/v1/trips`, {
    headers,
    data: {
      slug,
      name: tripName,
      created_by: ownerId,
      kind: "bachelor",
    },
  });
  if (!tripResp.ok()) {
    throw new Error(
      `seed-invite: insert trips failed (${tripResp.status()}): ${await tripResp.text()}`
    );
  }
  const [trip] = await tripResp.json();

  // Organizer membership for the seed user — display_name feeds
  // `invite_preview`'s `host_display_name`.
  await request.post(`${SUPABASE_URL}/rest/v1/trip_members`, {
    headers,
    data: {
      trip_id: trip.id,
      user_id: ownerId,
      role: "organizer",
      rsvp_status: "going",
      display_name: hostDisplayName,
    },
  });

  const inviteResp = await request.post(`${SUPABASE_URL}/rest/v1/invites`, {
    headers,
    data: { trip_id: trip.id, created_by: ownerId, uses_left: null },
  });
  if (!inviteResp.ok()) {
    throw new Error(
      `seed-invite: insert invites failed (${inviteResp.status()}): ${await inviteResp.text()}`
    );
  }
  const [invite] = await inviteResp.json();

  return { token: invite.token as string, tripId: trip.id as string, ownerId };
}

/**
 * Best-effort: reuse the first user we find, otherwise mint one via the
 * admin API. Idempotent enough for repeated local runs.
 */
async function ensureSeedUser(
  request: APIRequestContext,
  headers: Record<string, string>
): Promise<string> {
  const listResp = await request.get(
    `${SUPABASE_URL}/auth/v1/admin/users?per_page=1`,
    { headers }
  );
  if (listResp.ok()) {
    const body = (await listResp.json()) as {
      users?: Array<{ id: string }>;
    };
    if (body.users && body.users.length > 0) {
      return body.users[0].id;
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
      `seed-invite: admin user create failed (${createResp.status()}): ${await createResp.text()}`
    );
  }
  const created = (await createResp.json()) as { id: string };
  return created.id;
}

/**
 * Best-effort cleanup — delete the seeded trip (cascades to
 * trip_members / invites via FK). Non-fatal if it fails; local re-runs
 * use a unique slug so leftover rows don't collide.
 */
export async function cleanupSeededTrip(tripId: string): Promise<void> {
  const headers = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  };
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/trips?id=eq.${tripId}`, {
      method: "DELETE",
      headers,
    });
  } catch (err) {
    console.error(`seed-invite: cleanup failed for trip ${tripId} —`, err);
  }
}
