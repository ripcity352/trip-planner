/**
 * Empty-state copy palette — every list/section that can render empty
 * pulls its string from here, never inline literals.
 *
 * Voice test: "would you say this out loud at a pre-trip dinner?"
 * Warm, irreverent, specific. Anti-SaaS — no "Get started!", no
 * "No data yet!", no "Looks like you don't have any X."
 *
 * When adding a key:
 *   1. Add it to `EmptyStateKey`.
 *   2. Add a string to `EMPTY_STATES` (compiler enforces exhaustiveness).
 *   3. Read it aloud once. If it sounds like a SaaS onboarding email,
 *      rewrite it.
 *
 * Microcopy review is a PR-template checklist item — see
 * `.github/pull_request_template.md` and
 * `notes/research/ux-design-principles.md`.
 */

export type EmptyStateKey =
  | "itinerary"
  | "members"
  | "expenses"
  | "announcements"
  | "polls"
  | "photos"
  | "trips_mine"
  | "invites_for_trip";

export const EMPTY_STATES: Record<EmptyStateKey, string> = {
  itinerary: "Nothing booked yet. Dave's working on it.",
  members: "Just you so far. The group chat fills in fast.",
  expenses: "No one's spent a dime — or no one's logged it. Same diff.",
  announcements: "All quiet. No news is probably good news.",
  polls: "Nothing to vote on yet. Someone's got opinions, just not here.",
  photos:
    "No photos yet. Someone has to be sober enough to take the first one.",
  trips_mine:
    "Nothing planned yet. Start a trip and we'll figure the rest out.",
  invites_for_trip:
    "No links out yet. Mint one and start texting it around.",
};

/**
 * CTAs paired with empty states. Partial because not every empty state
 * needs a button — sometimes the absence IS the message (e.g.
 * `announcements`, where the silence is the point).
 *
 * Same voice rules as `EMPTY_STATES`. Keep these <= 40 chars so they
 * fit on a button at 375px without wrapping.
 */
export const EMPTY_STATE_CTAS: Partial<Record<EmptyStateKey, string>> = {
  trips_mine: "Start a trip",
  // Other keys add their CTA strings here as features land.
};

/**
 * Attendee-count bucket labels for the logged-out invite preview
 * (`/invite/[token]`). The underlying RPC returns a bucket name (not
 * the raw integer — that would be an enumeration oracle) and we render
 * the corresponding string. Voice test on each: would I describe it
 * this way out loud?
 *
 * Wave 2a only — if more bucket consumers land, hoist this into its
 * own palette file. For now the two-palette discipline holds.
 */
export type AttendeeCountBucketLabelKey =
  | "just-getting-started"
  | "small-crew"
  | "full-house"
  | "big-group";

export const ATTENDEE_COUNT_BUCKET_LABELS: Record<
  AttendeeCountBucketLabelKey,
  string
> = {
  "just-getting-started": "Just getting going",
  "small-crew": "Small crew so far",
  "full-house": "Full house",
  "big-group": "Big group",
};

/**
 * M2 UI scaffolding strings — every label / heading / placeholder that
 * lives on a `/trips/new`, `/trips/[tripId]`, or `/invite/[token]` page
 * sources from this palette, NOT inline literals. Same voice rules as
 * EMPTY_STATES (warm, irreverent, specific; "would you say this at a
 * pre-trip dinner?"). Strings are kept short — under 120 chars so
 * the existing palette-length test covers them.
 *
 * Naming convention: `<surface>_<role>` (e.g. `newTrip_submit`,
 * `dashboard_section_rsvp_heading`). Greppable; collapses the surface
 * vs. semantic axes a future translator will care about.
 */
export const M2_UI_STRINGS = {
  // /trips/new
  newTrip_pageTitle: "Start a trip — Party Trip",
  newTrip_heading: "Start a trip",
  newTrip_nameLabel: "Name",
  newTrip_startLabel: "From",
  newTrip_endLabel: "To",
  newTrip_submit: "Lock it in",
  newTrip_vibePromptLabel: "What's the vibe?",
  // /trips/[tripId] dashboard
  dashboard_section_rsvp_heading: "Who's in",
  dashboard_section_rsvp_body: "RSVPs roll in here.",
  dashboard_section_invite_heading: "Share the link",
  dashboard_section_invite_body:
    "Pop a link in the group chat. People click it, they're in.",
  dashboard_invite_placeholder:
    "Invite issuance UI ships next slice — mint links from the database for now.",
  dashboard_dates_unset: "Dates not locked in yet.",
  // /invite/[token]
  invitePreview_cta_authed: "Count me in",
  invitePreview_cta_anon: "Sign in to join",
  invitePreview_back_link: "Back home",
  invitePreview_dates_unset: "Dates TBD",
} as const;

export type M2UIStringKey = keyof typeof M2_UI_STRINGS;
