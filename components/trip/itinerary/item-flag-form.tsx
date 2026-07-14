"use client";

/**
 * ItemFlagForm — per-item dietary/participation flag entry (#80, updated M4 W1c).
 *
 * M4 W1c: The freeform text entry point has been replaced with
 * <MemberFlagPicker> — a chip picker that surfaces the 9 most common
 * flags from MEMBER_FLAG_CHIPS plus a freeform fallback.
 *
 * The submit/validate logic (addItemFlag server action, error/saved state)
 * lives inside MemberFlagPicker. This wrapper preserves the external
 * interface (itemId, className) so call sites don't need updates.
 */

import { cn } from "@/lib/utils";
import { MemberFlagPicker, type MemberFlagRow } from "./member-flag-picker";

export interface ItemFlagFormProps {
  itemId: string;
  /** #365: flag rows the member already saved — pre-selects the fixed chips
   * and (#398) renders custom rows as removable entries, so a second visit
   * shows (and can edit) what was sent, not a blank form. */
  initialFlags?: ReadonlyArray<MemberFlagRow>;
  className?: string;
}

export function ItemFlagForm({ itemId, initialFlags, className }: ItemFlagFormProps) {
  return (
    <MemberFlagPicker
      itemId={itemId}
      initialFlags={initialFlags}
      className={cn(className)}
    />
  );
}
