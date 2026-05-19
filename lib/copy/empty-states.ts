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
  | "photos";

export const EMPTY_STATES: Record<EmptyStateKey, string> = {
  itinerary: "Nothing booked yet. Dave's working on it.",
  members: "Just you so far. The group chat fills in fast.",
  expenses: "No one's spent a dime — or no one's logged it. Same diff.",
  announcements: "All quiet. No news is probably good news.",
  polls: "Nothing to vote on yet. Someone's got opinions, just not here.",
  photos:
    "No photos yet. Someone has to be sober enough to take the first one.",
};
