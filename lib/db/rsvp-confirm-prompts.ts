/**
 * rsvp_confirm_prompts data layer (#549 — organizer-sent RSVP confirm-prompt).
 *
 * A pending organizer→member ask ("Dave heard you're in — tap to confirm").
 * This table NEVER holds the authoritative RSVP — the member's own tap
 * writes `trip_members.rsvp_status` via the existing setRsvpAction. These
 * reads drive the member's /me confirm banner and the organizer roster
 * "asked" cue. RLS (same migration) enforces who sees what: a member reads
 * the ask addressed to them; organizers read asks in their trip.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { RsvpConfirmPrompt } from "./types";

/** The member's own view of their pending ask (feeds the confirm banner). */
export interface MemberRsvpPrompt {
  id: string;
  proposedStatus: RsvpConfirmPrompt["proposed_status"];
  note: string | null;
  /** trip_member_id of the organizer who sent it. */
  sentByTripMemberId: string;
  /** The sender's display name (null if unset — the banner falls back). */
  senderName: string | null;
}

/**
 * The pending ask addressed to `tripMemberId`, or null if none. RLS limits
 * this to the caller's own ask (member SELECT own) — the caller passes
 * their own trip_member_id. At most one row (the one-active unique index).
 *
 * The sender's display name is embedded via the `sent_by_trip_member_id`
 * FK (disambiguated from the `trip_member_id` FK, which also points at
 * trip_members) so the banner can say "Dave heard you're in" in one query.
 */
export async function getActivePromptForMember(
  supabase: SupabaseClient,
  tripMemberId: string
): Promise<MemberRsvpPrompt | null> {
  const { data, error } = await supabase
    .from("rsvp_confirm_prompts")
    .select(
      "id, proposed_status, note, sent_by_trip_member_id, sender:trip_members!sent_by_trip_member_id(display_name)"
    )
    .eq("trip_member_id", tripMemberId)
    .maybeSingle();

  if (error) {
    throw new Error(`getActivePromptForMember failed: ${error.message}`);
  }
  if (!data) return null;

  // PostgREST infers the FK embed as an array type even though this is a
  // many-to-one (each prompt has exactly one sender), and returns a single
  // object at runtime. Normalize both shapes defensively.
  const row = data as unknown as {
    id: string;
    proposed_status: RsvpConfirmPrompt["proposed_status"];
    note: string | null;
    sent_by_trip_member_id: string;
    sender:
      | { display_name: string | null }
      | { display_name: string | null }[]
      | null;
  };
  const senderRow = Array.isArray(row.sender) ? row.sender[0] : row.sender;
  return {
    id: row.id,
    proposedStatus: row.proposed_status,
    note: row.note,
    sentByTripMemberId: row.sent_by_trip_member_id,
    senderName: senderRow?.display_name ?? null,
  };
}

/**
 * All pending asks for a trip, keyed by the asked member's trip_member_id
 * (feeds the organizer roster "asked" cue). RLS limits this to organizers
 * of the trip; a plain member gets only their own row back, so callers
 * MUST gate the surface on organizer role before relying on completeness.
 */
export async function getPromptsByTrip(
  supabase: SupabaseClient,
  tripId: string
): Promise<Map<string, RsvpConfirmPrompt["proposed_status"]>> {
  const { data, error } = await supabase
    .from("rsvp_confirm_prompts")
    .select("trip_member_id, proposed_status")
    .eq("trip_id", tripId);

  if (error) {
    throw new Error(`getPromptsByTrip failed: ${error.message}`);
  }

  const rows = (data ?? []) as ReadonlyArray<{
    trip_member_id: string;
    proposed_status: RsvpConfirmPrompt["proposed_status"];
  }>;
  return new Map(rows.map((r) => [r.trip_member_id, r.proposed_status]));
}
