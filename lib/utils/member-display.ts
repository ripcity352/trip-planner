import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

type MemberLike = { display_name?: string | null };

export function resolveMemberName(
  memberMap: ReadonlyMap<string, MemberLike>,
  id: string,
): string {
  return memberMap.get(id)?.display_name ?? M3_UI_STRINGS.roster_member_fallback_name;
}
