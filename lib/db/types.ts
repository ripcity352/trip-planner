/**
 * Database row types — hand-rolled to match the latest applied migration.
 * Source of truth: `supabase/migrations/`. Current applied set:
 *   * 0001_init.sql
 *   * 20260519123255_m1_foundation.sql
 *   * 20260519191412_m2_trip_role_co_organizer.sql
 *   * 20260519191413_m2_trips_and_invites.sql
 *   * 20260519202859_m2_rsvp_idempotency_scope.sql
 *   * 20260519204313_m2_date_poll.sql
 *   * 20260520052357_m3_itinerary_announcements.sql
 *   * 20260521012212_m4_carry_back.sql
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

export type TripRole = "organizer" | "co_organizer" | "attendee";
// `co_organizer` added in 20260519191412_m2_trip_role_co_organizer.sql.
// `is_trip_organizer()` returns true for both `organizer` and `co_organizer`
// per the M2 ADR — see notes/decisions.md.

/**
 * Bucketed attendee-count returned by `public.invite_preview(token)`.
 *
 * We deliberately do NOT expose the raw integer to anonymous callers:
 * a single-use invite would otherwise act as an enumeration oracle
 * (each forward increments the count by 1, so the recipient can map
 * who else got the link).
 */
export type AttendeeCountBucket =
  | "just-getting-started"
  | "small-crew"
  | "full-house"
  | "big-group";

/**
 * Logged-out-safe payload returned by `public.invite_preview(token)` (v2,
 * 20260709170100_invite_preview_v2.sql).
 *
 * `starts_at`/`ends_at` are date-only `YYYY-MM-DD` strings — the RPC
 * returns the `date` columns natively (#364; transport rule in
 * notes/design-system.md "Parsing axis"), and the lib/db boundary
 * truncates any timestamp-shaped stragglers as belt-and-braces.
 *
 * `viewer_is_member` is true iff the CALLING client carried a session
 * whose user is a trip_member of the invite's trip (#367). Anon calls
 * always yield false. `trip_slug` is disclosed only alongside
 * `viewer_is_member === true` — anon disclosure is unchanged from v1.
 */
export interface InvitePreview {
  trip_name: string;
  starts_at: string | null;
  ends_at: string | null;
  host_display_name: string;
  attendee_count_bucket: AttendeeCountBucket;
  viewer_is_member: boolean;
  trip_slug: string | null;
}

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
  // W0 addition — mirrors auth.users.encrypted_password presence without
  // exposing the auth schema to RLS. Written atomically inside the same
  // server-action closure as updateUser({password}) / signUp({password}).
  has_password: boolean;
}

// Trip is defined in the M3 section below with the `notes` column added.

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
  // Client-generated UUID for accept_invite replay safety. Unique per
  // (trip_id, idempotency_key) where set — see 20260519191413_m2_*.sql.
  idempotency_key: string | null;
}

export interface Invite {
  token: string;
  trip_id: string;
  created_by: string;
  expires_at: string | null;
  uses_left: number | null;
  created_at: string;
  // M4 addition (Delta 2)
  idempotency_key?: string | null;
}

export interface Availability {
  trip_member_id: string;
  date: string;
  status: AvailabilityStatus;
  updated_at: string;
  idempotency_key: string | null;
}

// Announcement is defined in the M3 section below with `created_by` added.

// ItineraryItem is defined in the M3 section below with kind/activity_tag/dress_code/idempotency_key added.

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
  visibility: TripVisibility;
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

// =============================================================
// Wave 3 — Date poll (celebrant-weighted, PulsePoll)
// =============================================================
// Mirrors `20260519204313_m2_date_poll.sql`. See `notes/m2-execution
// -plan.md` Appendix A for the architect-signed contract.

/**
 * Celebrant's chip for a given candidate window.
 *
 * - `works`             — green-light, voting proceeds normally
 * - `works-with-effort` — voting proceeds; UI surfaces a "could work
 *                         for the celebrant" badge so members weigh it
 * - `no-go`             — vetoes the candidate; hidden from member
 *                         voting UI; SQL trigger blocks vote inserts
 */
export type DatePollCelebrantMark = "works" | "works-with-effort" | "no-go";

export interface DatePollCandidate {
  id: string;
  trip_id: string;
  label: string;
  /** ISO date — `YYYY-MM-DD`. */
  starts_on: string;
  /** ISO date — `YYYY-MM-DD`. */
  ends_on: string;
  created_by: string;
  created_at: string;
}

export interface DatePollCelebrantMarkRow {
  candidate_id: string;
  mark: DatePollCelebrantMark;
  marked_by: string;
  marked_at: string;
}

export interface DatePollVote {
  candidate_id: string;
  trip_member_id: string;
  vote: boolean;
  voted_at: string;
  idempotency_key: string | null;
}

/**
 * Composite view-model for one candidate, the load-bearing shape the
 * dates page renders. Vote counts are aggregate-only — voter names
 * are intentionally NOT threaded through this surface per the
 * aggregate-only ADR. `my_vote` is the caller's own vote (or null
 * if they haven't voted yet).
 */
export interface DatePollCandidateView {
  candidate: DatePollCandidate;
  mark: DatePollCelebrantMark | null;
  yes_votes: number;
  no_votes: number;
  my_vote: boolean | null;
}

// =============================================================
// M3 — Itinerary + Announcements (Wave 1)
// Mirrors `20260520052357_m3_itinerary_announcements.sql`.
// Architect-signed contract: notes/m3-execution-plan.md Appendix A.
// =============================================================

/**
 * Category of an itinerary item. Drives kind icon + feature eligibility.
 * `lodging` enables room assignments; `transport` drives the arrivals
 * manifest UI. Default on insert: `activity`.
 */
export type ItineraryItemKind =
  | "event"
  | "lodging"
  | "transport"
  | "meal"
  | "activity";

/**
 * Mode of transport for a travel leg entry.
 */
export type TravelLegKind = "flight" | "train" | "drive" | "other";

/**
 * Per-item RSVP status. Absence of a row means the member inherits
 * the day-level RSVP from `trip_member_days`. A row only exists when
 * the member has explicitly overridden the day-level default.
 */
export type ItineraryItemRsvpStatus = "going" | "skipping";

/**
 * Extended `itinerary_items` row. Adds M3 columns on top of the M1
 * base shape (address + visibility already present from m1_foundation).
 */
export interface ItineraryItem {
  id: string;
  trip_id: string;
  /** ISO date — `YYYY-MM-DD`. Day this item falls on. */
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
  visibility: TripVisibility;
  // M3 additions
  kind: ItineraryItemKind;
  activity_tag: string[];
  dress_code: string | null;
  idempotency_key: string | null;
  // M4 additions (Delta 6)
  address_place_id?: string | null;
  address_provider?: string | null;
}

/**
 * Extended `trips` row. Adds `notes` column from M3 Wave 1 (#78).
 */
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
  // M3 addition
  notes: string | null;
  // M4 addition (Delta 5)
  timezone: string;
}

/**
 * Extended `announcements` row. Adds `created_by` column from M3 Wave 1.
 * The original `author_id` column is preserved for backward compatibility.
 *
 * `authorDisplayName` is NOT a DB column — it is resolved at the data-layer
 * boundary via a PostgREST join (getAnnouncements) or via the memberUserMap
 * passed to subscribeToAnnouncements. null means the member could not be
 * resolved; the UI should fall back to M3_UI_STRINGS.announcements_author_fallback.
 */
export interface Announcement {
  id: string;
  trip_id: string;
  author_id: string;
  body: string;
  pinned: boolean;
  created_at: string;
  idempotency_key: string | null;
  visibility: TripVisibility;
  // M3 addition
  created_by: string | null;
  // W1c addition — resolved at the data-layer boundary, not a DB column
  authorDisplayName?: string | null;
}

/**
 * A room/bed assignment linking a trip member to a lodging itinerary item.
 * The referenced item MUST have `kind = 'lodging'` (DB trigger enforces this).
 */
export interface LodgingAssignment {
  id: string;
  item_id: string;
  trip_member_id: string;
  room_label: string | null;
  created_at: string;
}

/**
 * A travel leg logged by a trip member. `trip_member_id` is owner-only
 * for write operations; all trip members can read the arrivals manifest.
 */
export interface TravelLeg {
  id: string;
  trip_id: string;
  trip_member_id: string;
  kind: TravelLegKind;
  depart_at: string | null;
  arrive_at: string | null;
  carrier: string | null;
  confirmation_code: string | null;
  notes: string | null;
  idempotency_key: string | null;
  created_at: string;
  // M4 additions (Delta 7)
  airline_iata?: string | null;
  flight_number?: string | null;
}

/**
 * Per-member per-item RSVP override. Absence of a row = inherited day-level
 * RSVP. Opt-outs are silent — not visible to peers.
 */
export interface ItineraryItemRsvp {
  item_id: string;
  trip_member_id: string;
  status: ItineraryItemRsvpStatus;
  idempotency_key: string | null;
  updated_at: string;
}

/**
 * Per-member per-item participation flag. `flag` is freeform text (no enum
 * per CLAUDE.md rule #8 — "don't encode a default"). Examples: "vegan",
 * "sober", "late-arrival". SELECT is organizer-only via RLS.
 */
export interface ItineraryItemMemberFlag {
  id: string;
  item_id: string;
  trip_member_id: string;
  flag: string;
  note: string | null;
  created_at: string;
}
