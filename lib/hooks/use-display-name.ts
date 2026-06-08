import { useMemo } from "react";
import { resolveMemberName } from "@/lib/utils/member-display";

type MemberLike = { display_name?: string | null };

/**
 * Layer-2 of the design-system three-layer model.
 *
 * Single canonical way for components to turn a trip_member_id into a
 * display name. Delegates entirely to resolveMemberName — no second
 * resolution path, no email local-part derivation.
 */
export function useDisplayName(
  memberMap: ReadonlyMap<string, MemberLike>,
  id: string,
): string {
  return useMemo(
    () => resolveMemberName(memberMap, id),
    [memberMap, id],
  );
}
