/**
 * The fixed announcement-reaction set (#389).
 *
 * Hard cap of 6 — reaction inflation is hard-banned (CLAUDE.md
 * "What NOT to do" / killed-and-deferred.md). This is the ONE app-side
 * source of truth; it is mirrored in the DB CHECK constraint in
 * `supabase/migrations/20260710060000_announcement_reactions.sql`.
 * Changing the set means a new migration — never edit one side without
 * the other.
 *
 * Set rationale (voice test — would you send these in the group chat?):
 * 👍 plain ack · ❤️ warm ack · 😂 it's funny · 🔥 hype without copy ·
 * 🫡 "on it" / roger that · 🍻 cheers, occasion-specific without being
 * frat-coded. No penis-coded, no gender-assuming, no inflation.
 *
 * Lives outside `lib/actions/` so client components can import it
 * without pulling a "use server" module (date-poll-constants precedent).
 */
export const REACTION_EMOJI = ["👍", "❤️", "😂", "🔥", "🫡", "🍻"] as const;

export type ReactionEmoji = (typeof REACTION_EMOJI)[number];

/** Type guard for narrowing raw DB/user strings to the fixed set. */
export function isReactionEmoji(value: string): value is ReactionEmoji {
  return (REACTION_EMOJI as readonly string[]).includes(value);
}
