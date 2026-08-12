/**
 * The fixed shopping-item-reaction set (spec §12.1).
 *
 * Hard cap of 6 — reaction inflation is hard-banned (CLAUDE.md
 * "What NOT to do" / killed-and-deferred.md). This is the ONE app-side
 * source of truth; it is mirrored in the DB CHECK constraint in
 * `supabase/migrations/20260811020000_shopping_social.sql`. Changing the
 * set means a new migration — never edit one side without the other.
 *
 * Two-surface split (spec §12.1): the glanceable row only ever renders
 * `ROW_LIKE_EMOJI` (👍) as an inline like control + count; the full set
 * (including 👎, with neutral aria labels — never "dislike") is reserved
 * for the tap-in detail sheet. This drops the announcement set's 🫡 to fit
 * 👎 within the six-cap.
 *
 * Lives outside `lib/actions/` so client components can import it without
 * pulling a "use server" module (date-poll-constants / reactions/constants
 * precedent).
 */
export const SHOPPING_REACTION_EMOJI = [
  "👍",
  "👎",
  "❤️",
  "🔥",
  "😂",
  "🍻",
] as const;

/** The only reaction the glanceable row surfaces (spec §12.1/§12.6). */
export const ROW_LIKE_EMOJI = "👍";

export type ShoppingReactionEmoji = (typeof SHOPPING_REACTION_EMOJI)[number];

/** Type guard for narrowing raw DB/user strings to the fixed set. */
export function isShoppingReactionEmoji(
  value: string
): value is ShoppingReactionEmoji {
  return (SHOPPING_REACTION_EMOJI as readonly string[]).includes(value);
}

/**
 * Neutral per-pill aria-labels for the detail-sheet reaction strip (spec
 * §12.6). MUST stay neutral — "thumbs down", never "dislike"/"downvote",
 * which would smuggle a toxic frame to screen readers that the visual
 * emoji itself doesn't carry. Every entry here is read aloud by a screen
 * reader on every render of the strip, so this is the one place voice
 * discipline is a11y-load-bearing, not just a nice-to-have.
 */
export const SHOPPING_REACTION_ARIA: Record<ShoppingReactionEmoji, string> = {
  "👍": "thumbs up",
  "👎": "thumbs down",
  "❤️": "heart",
  "🔥": "fire",
  "😂": "laughing",
  "🍻": "cheers",
};
