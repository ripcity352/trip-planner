/**
 * Locked dress-code chip list for itinerary items.
 *
 * Voice-locked per Override H (M4 execution plan). Every chip here was
 * voice-tested — "would you say this at a pre-trip dinner?"
 *
 * Hard bans:
 *   - No "Athleisure" — too bland, failed voice testing
 *   - No bare "Cocktail" — ambiguous out of context; use "Cocktail attire"
 *
 * To add or change a chip: update this file, the snapshot test in
 * lib/data/__tests__/dress-codes.test.ts, and get PR sign-off on the
 * voice PR checklist item.
 */

export const DRESS_CODE_CHIPS = [
  "Whatever you've got",
  "Polo + shorts",
  "Sneakers OK",
  "Loud shirts",
  "Cocktail attire",
  "Pool casual",
  "Black tie if you own one",
  "Costume",
] as const;

export type DressCodeChip = (typeof DRESS_CODE_CHIPS)[number];
