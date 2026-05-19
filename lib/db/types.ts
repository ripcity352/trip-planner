/**
 * Database row types — hand-rolled to match the latest applied migration.
 * Source of truth: `supabase/migrations/`. Current applied set:
 *   * 0001_init.sql
 *   * 20260519123255_m1_foundation.sql
 *
 * To regenerate from the linked Supabase project (requires a PAT in
 * SUPABASE_ACCESS_TOKEN), run:
 *
 *   pnpm types:gen
 *
 * That writes the full `Database` type to `lib/db/database.types.ts`. We
 * keep the curated types in this file so app code reads cleanly; the
 * generated file is a verification reference.
 */

// =============================================================
// Enums
// =============================================================

export type TripRole = "organizer" | "attendee";
// `co_organizer` lands in the Goal 2 migration — add to this union then.

export type RsvpStatus = "pending" | "going" | "maybe" | "declined";

export type AvailabilityStatus = "yes" | "no" | "maybe";

export type TripKind = "bachelor";

export type TripVisibility =
  | "everyone"
  | "organizers_only"
  | "hide_from_celebrant"
  | "custom";

export type TripMemberDayStatus = "going" | "maybe" | "declined";

// =============================================================
// Rows
// =============================================================

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
}

export interface Trip {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  kind: TripKind;
  is_template: boolean;
  deleted_at: string | null;
  archived_at: string | null;
  vibe_tags: string[];
}

export interface TripMember {
  id: string;
  trip_id: string;
  // Nullable because accountless attendees (invited by email/phone) have
  // no auth.users row yet — they claim their seat at first sign-in.
  user_id: string | null;
  role: TripRole;
  rsvp_status: RsvpStatus;
  joined_at: string;
  is_celebrant: boolean;
  display_name: string | null;
  phone_e164: string | null;
  email: string | null;
}

export interface Invite {
  token: string;
  trip_id: string;
  created_by: string;
  expires_at: string | null;
  uses_left: number | null;
  created_at: string;
}

export interface Availability {
  trip_member_id: string;
  date: string;
  status: AvailabilityStatus;
  updated_at: string;
  idempotency_key: string | null;
}

export interface Announcement {
  id: string;
  trip_id: string;
  author_id: string;
  body: string;
  pinned: boolean;
  created_at: string;
  idempotency_key: string | null;
}

export interface ItineraryItem {
  id: string;
  trip_id: string;
  day: string;
  start_time: string | null;
  end_time: string | null;
  title: string;
  location: string | null;
  address: string | null;
  notes: string | null;
  cost_cents: number | null;
  currency: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  trip_id: string;
  payer_id: string;
  amount_cents: number;
  currency: string;
  description: string;
  occurred_on: string;
  created_at: string;
  idempotency_key: string | null;
}

export interface ExpenseSplit {
  expense_id: string;
  trip_member_id: string;
  amount_cents: number;
  currency: string;
}

export interface TripMemberDay {
  id: string;
  trip_member_id: string;
  date: string;
  status: TripMemberDayStatus;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}
