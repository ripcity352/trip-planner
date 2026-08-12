import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

/**
 * Longest display_name any capture surface accepts (invite-accept and
 * the /me profile editor share it — #368/#262). Past this, it stops
 * being a name.
 */
export const DISPLAY_NAME_MAX_LENGTH = 80;

type MemberLike = { display_name?: string | null };

export function resolveMemberName(
  memberMap: ReadonlyMap<string, MemberLike>,
  id: string,
): string {
  return memberMap.get(id)?.display_name ?? M3_UI_STRINGS.roster_member_fallback_name;
}

/**
 * Content-authorship name resolution (shopping-item "Added by" header +
 * Notes thread rows, spec §12.4/§12.6) — deliberately a SEPARATE fallback
 * from `resolveMemberName`. A departed author (member left the trip, FK
 * `ON DELETE SET NULL`) or an unresolvable id falls back to "Someone"
 * (`M3_UI_STRINGS.announcements_author_fallback`), never `resolveMemberName`'s
 * roster "Guest" fallback — the two contexts read differently ("Guest" is
 * an un-named ROSTER seat; "Someone" is an attribution gap on a piece of
 * content whose author is gone).
 *
 * `preResolved` lets callers pass an already-server-resolved display name
 * (e.g. `ShoppingItemComment.authorDisplayName`, set by `enrichComments`)
 * without re-deriving it — falls through to the memberMap/id path only
 * when absent.
 */
export function resolveContentAuthorName(
  memberMap: ReadonlyMap<string, MemberLike>,
  id: string | null,
  preResolved?: string | null,
): string {
  if (preResolved) return preResolved;
  if (id) {
    const name = memberMap.get(id)?.display_name;
    if (name) return name;
  }
  return M3_UI_STRINGS.announcements_author_fallback;
}
