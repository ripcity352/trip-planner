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
