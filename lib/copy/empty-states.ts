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
