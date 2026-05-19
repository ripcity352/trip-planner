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

import type { Invite, InvitePreview } from "./types";

const INVITE_COLUMNS =
  "token, trip_id, created_by, expires_at, uses_left, created_at";

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
  // function emits exactly one row or none, so we read [0].
  return data[0] as InvitePreview;
}

/**
 * Lists every invite for a trip, newest first. RLS on `invites`
 * already gates this to organizers + co-organizers — we don't add an
 * app-level check.
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
 * Inserts a new invite row. RLS gates writes to organizers; the M1
 * INSERT policy enforces `with check (is_trip_organizer(trip_id) and
 * auth.uid() = created_by)`. The caller passes the userId explicitly
 * so this function stays a thin typed wrapper — auth lookup belongs in
 * the server-action layer.
 *
 * `usesLeft = null` means "unlimited"; `expiresAt = null` means
 * "never expires". Both null is the most permissive shape; the UI
 * surfaces the trade-off so the organizer is the one choosing.
 */
export interface CreateInviteRecordInput {
  tripId: string;
  createdBy: string;
  usesLeft: number | null;
  expiresAt: string | null;
}

export async function createInviteRecord(
  supabase: SupabaseClient,
  tripId: string,
  usesLeft: number | null,
  expiresAt: string | null,
  createdBy?: string
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

  const { data, error } = await supabase
    .from("invites")
    .insert(payload)
    .select(INVITE_COLUMNS)
    .single();

  if (error) {
    throw new Error(`createInviteRecord failed: ${error.message}`);
  }

  return data as Invite;
}

/**
 * Revokes an invite by clamping `expires_at` to `now()`. We don't
 * delete the row so we can still surface "this link was revoked" if
 * someone clicks it. RLS gates writes to organizers.
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
