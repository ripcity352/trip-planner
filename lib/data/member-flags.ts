/**
 * Per-item member-flag chips. Organizer-visible only; member self-read
 * enabled via Delta 1.
 *
 * No "skipping" chip — that path is per-item RSVP, not a flag.
 *
 * Sourced from persona-edge-attendees.md:
 *   - Dietary restrictions (Priya / celiac persona)
 *   - Sober attendee (Devin persona — private flag, not a profile stamp)
 *   - Late arrival (Hugo persona — logistics note to organizer)
 *
 * Voice-locked per Override H. Chips are intentionally short and
 * non-judgmental — the attendee is opting INTO sharing, not opting out
 * of an assumption. See the master design principle in persona-edge-attendees.md.
 */

export const MEMBER_FLAG_CHIPS = [
  "Vegetarian",
  "Vegan",
  "Gluten-free",
  "Dairy-free",
  "Nut allergy",
  "Shellfish allergy",
  "Sober",
  "Sitting this one out",
  "Late arrival",
] as const;

export type MemberFlagChip = (typeof MEMBER_FLAG_CHIPS)[number];
