/**
 * Neutral activity-tag seeds for itinerary items.
 *
 * These are deliberately neutral — bach-coded activities (strip clubs,
 * etc.) go through the freeform fallback. No "strip-club", "bachelor",
 * "bachelorette", or penis-coded suggestions — see
 * notes/killed-and-deferred.md hard-banned section and Phase 2
 * Voice/Persona C2.
 *
 * Tags also power the sober-attendee balance audit (persona-edge-attendees.md
 * Devin section) — an organizer with 4 `bar`/`club` tags and 0 non-bar
 * tags gets a nudge to add a daytime activity.
 *
 * Voice-locked per Override H (M4 execution plan).
 */

export const ACTIVITY_TAG_CHIPS = [
  "meal",
  "bar",
  "club",
  "outdoor",
  "chill",
  "gaming",
  "spa",
  "pool",
  "show",
] as const;

export type ActivityTagChip = (typeof ACTIVITY_TAG_CHIPS)[number];
