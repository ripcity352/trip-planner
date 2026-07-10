/**
 * Invite data layer — typed wrappers around the `invites` table and the
 * two SECURITY DEFINER functions added in 20260519191413_m2_*.sql:
 *
 *   - `invite_preview(token)` — logged-out-safe preview with a bucketed
 *      attendee count. Anonymous callers route through this RPC because
 *      RLS on `invites` denies them direct SELECT.
 *   - `accept_invite(token, idempotency_key)` — atomic accept handler.
 *      Wired from `lib/actions/invites.ts`, not here, because it's a
 *      mutation.
 *
 * The conventions mirror `lib/db/trips.ts`:
 *   - Functions accept a SupabaseClient so the same call site works
 *     from Server Components and Server Actions.
 *   - "Not found" is `null` (preview) / `[]` (list), not a thrown error.
 *   - Unexpected errors throw with a descriptive `Error` message; the
 *     caller decides how to surface them.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AttendeeCountBucket, Invite, InvitePreview } from "./types";

const INVITE_COLUMNS =
  "token, trip_id, created_by, expires_at, uses_left, created_at";

/**
 * Runtime contract for the bucketed attendee count the SQL function
 * returns as `text`. We narrow at the data-layer boundary so the rest
 * of the app can rely on the typed union — and so an unexpected DB
 * value (migration drift, manual SQL tweak) fails loud here rather
 * than silently mis-rendering downstream.
 */
const ATTENDEE_COUNT_BUCKETS: readonly AttendeeCountBucket[] = [
  "just-getting-started",
  "small-crew",
  "full-house",
  "big-group",
] as const;

function isAttendeeCountBucket(s: string): s is AttendeeCountBucket {
  return (ATTENDEE_COUNT_BUCKETS as readonly string[]).includes(s);
}

/**
 * #364 belt-and-braces: `invite_preview` v2 returns the `date` columns
 * natively (`YYYY-MM-DD`), so this is normally a no-op. It stays because
 * the Vercel deploy and CI's `db push` land from the same merge on
 * different clocks — if the app briefly runs against the v1 function
 * (timestamptz at midnight UTC), truncating to the first 10 chars still
 * recovers exactly the calendar date, and this boundary only ever hands
 * out `YYYY-MM-DD`. See notes/design-system.md "Parsing axis (date-only
 * columns)" — transport rule.
 */
function toDateOnly(value: string | null): string | null {
  return value === null ? null : value.slice(0, 10);
}

/**
 * Calls the `invite_preview(p_token)` RPC. Returns the first row
 * (preview shape) or `null` when the invite is missing / expired /
 * exhausted / the trip is soft-deleted. Safe to call with an anonymous
 * Supabase client — the function is `grant execute ... to anon`.
 */
export async function getInvitePreview(
  supabase: SupabaseClient,
  token: string
): Promise<InvitePreview | null> {
  const { data, error } = await supabase.rpc("invite_preview", {
    p_token: token,
  });

  if (error) {
    throw new Error(`invite_preview failed: ${error.message}`);
  }

  if (!Array.isArray(data) || data.length === 0) {
    return null;
  }

  // RPC returns `setof record` — Supabase deserializes as an array. The
  // function emits exactly one row or none, so we read [0]. The v2
  // columns (#367) are optional in the runtime shape so a v1 function
  // (deploy/migrate race) degrades to the fail-closed defaults below.
  const row = data[0] as {
    trip_name: string;
    starts_at: string | null;
    ends_at: string | null;
    host_display_name: string;
    attendee_count_bucket: string;
    viewer_is_member?: boolean | null;
    trip_slug?: string | null;
  };

  // Narrow the bucket from `text` → typed union at the data boundary.
  // Unexpected values are migration-drift signals, not a happy-path
  // outcome; throw so it surfaces in logs immediately.
  if (!isAttendeeCountBucket(row.attendee_count_bucket)) {
    throw new Error(
      `invite_preview returned unexpected attendee_count_bucket: ${row.attendee_count_bucket}`
    );
  }

  return {
    trip_name: row.trip_name,
    starts_at: toDateOnly(row.starts_at),
    ends_at: toDateOnly(row.ends_at),
    host_display_name: row.host_display_name,
    attendee_count_bucket: row.attendee_count_bucket,
    // #367: membership fails CLOSED — anything but an explicit `true`
    // (v1 function, null, drift) renders the plain accept form, which
    // stays a safe no-op for members via accept_invite's re-claim path.
    viewer_is_member: row.viewer_is_member === true,
    trip_slug: row.viewer_is_member === true ? (row.trip_slug ?? null) : null,
  } satisfies InvitePreview;
}

/**
 * #385 — dead-link predicate. An invite is dead when its expiry has
 * passed (which includes revoked links: `revokeInvite` clamps
 * `expires_at` to `now()` and keeps the row precisely so the UI can say
 * "this link is dead") or when its uses are exhausted.
 *
 * Pure function — `now` is an explicit parameter so a Server Component
 * computes it once with the server clock (no SSR/client drift) and tests
 * stay deterministic. `<=` matches the revoke clamp: a link revoked this
 * instant is already dead.
 */
export function isInviteDead(
  invite: Pick<Invite, "expires_at" | "uses_left">,
  now: Date
): boolean {
  const expired =
    invite.expires_at !== null &&
    new Date(invite.expires_at).getTime() <= now.getTime();
  const exhausted = invite.uses_left === 0;
  return expired || exhausted;
}

/**
 * Lists every invite for a trip, newest first. SELECT RLS on `invites`
 * is gated by `is_trip_organizer(trip_id)` (organizers + co-organizers)
 * since 20260610051214_carry_invites_select_organizers_only.sql (#155)
 * — for a non-organizer member this returns `[]`, not an error. The
 * page-level `is_trip_organizer` check in
 * `app/(authed)/trips/[tripId]/invites/page.tsx` remains the first
 * gate (404 so the surface stays invisible); RLS is the authoritative
 * row-level one.
 *
 * Alias: `getInvitesByTrip` — same function, exported under the name
 * used by Wave 4c pages per `notes/m3-execution-plan.md` §"Wave 4".
 */
export async function getTripInvites(
  supabase: SupabaseClient,
  tripId: string
): Promise<Invite[]> {
  const { data, error } = await supabase
    .from("invites")
    .select(INVITE_COLUMNS)
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getTripInvites failed: ${error.message}`);
  }

  return (data ?? []) as Invite[];
}

/**
 * Alias for `getTripInvites` — Wave 4c pages use this name per the
 * execution plan's file ownership table.
 */
export const getInvitesByTrip = getTripInvites;

/**
 * Inserts a new invite row. RLS gates writes to organizers; the M1
 * INSERT policy enforces `with check (is_trip_organizer(trip_id) and
 * auth.uid() = created_by)`. The caller passes the userId explicitly
 * so this function stays a thin typed wrapper — auth lookup belongs in
 * the server-action layer.
 *
 * `usesLeft = null` means "unlimited"; `expiresAt = null` means
 * "never expires". Both null is the most permissive shape; the UI
 * surfaces the trade-off so the organizer is the one choosing.
 *
 * Positional params (not an options object) to keep the call site terse
 * — the action layer is the only caller and it already validates with
 * zod. If a third caller lands we hoist this to an options bag.
 */
export async function createInviteRecord(
  supabase: SupabaseClient,
  tripId: string,
  usesLeft: number | null,
  expiresAt: string | null,
  createdBy?: string,
  idempotencyKey?: string | null
): Promise<Invite> {
  const payload: Record<string, unknown> = {
    trip_id: tripId,
    uses_left: usesLeft,
    expires_at: expiresAt,
  };
  // `created_by` is required (column is NOT NULL). The action layer
  // passes it from auth.uid(); the optional shape here keeps the unit
  // test deterministic without spinning up an auth mock.
  if (createdBy) {
    payload.created_by = createdBy;
  }
  if (idempotencyKey) {
    payload.idempotency_key = idempotencyKey;
  }

  const { data, error } = await supabase
    .from("invites")
    .insert(payload)
    .select(INVITE_COLUMNS)
    .single();

  if (error) {
    // #366: replay of the same (trip_id, idempotency_key) trips the M4
    // Delta 2 partial unique index. That's not a failure — it's the
    // double-tap the key exists for. Return the invite the first tap
    // minted (postAnnouncement replay pattern).
    if (
      idempotencyKey &&
      (error as { code?: string }).code === "23505"
    ) {
      const { data: existing, error: selectError } = await supabase
        .from("invites")
        .select(INVITE_COLUMNS)
        .eq("trip_id", tripId)
        .eq("idempotency_key", idempotencyKey)
        .single();
      if (selectError) {
        throw new Error(
          `createInviteRecord replay re-select failed: ${selectError.message}`
        );
      }
      return existing as Invite;
    }
    throw new Error(`createInviteRecord failed: ${error.message}`);
  }

  return data as Invite;
}

/**
 * Revokes an invite by clamping `expires_at` to `now()`. We don't
 * delete the row so we can still surface "this link was revoked" if
 * someone clicks it.
 *
 * Delta 4 (M4) adds "organizers can update invites" RLS policy so the
 * UPDATE now returns the affected count correctly. The M3 band-aid
 * (.select("token") + zero-row throw) is removed — the policy is the
 * authoritative gate.
 */
export async function revokeInvite(
  supabase: SupabaseClient,
  token: string
): Promise<void> {
  const { error } = await supabase
    .from("invites")
    .update({ expires_at: new Date().toISOString() })
    .eq("token", token);

  if (error) {
    throw new Error(`revokeInvite failed: ${error.message}`);
  }
}
