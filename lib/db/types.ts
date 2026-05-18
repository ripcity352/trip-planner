/**
 * Database row types — hand-rolled to match `supabase/migrations/0001_init.sql`.
 *
 * These are the source of truth for app code today. To regenerate from the
 * linked Supabase project (requires a PAT in SUPABASE_ACCESS_TOKEN), run:
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
}

export interface TripMember {
  trip_id: string;
  user_id: string;
  role: TripRole;
  rsvp_status: RsvpStatus;
  joined_at: string;
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
  trip_id: string;
  user_id: string;
  date: string;
  status: AvailabilityStatus;
  updated_at: string;
}

export interface Announcement {
  id: string;
  trip_id: string;
  author_id: string;
  body: string;
  pinned: boolean;
  created_at: string;
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
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface Expense {
  id: string;
  trip_id: string;
  payer_id: string;
  amount_cents: number;
  description: string;
  occurred_on: string;
  created_at: string;
}

export interface ExpenseSplit {
  expense_id: string;
  user_id: string;
  amount_cents: number;
}
