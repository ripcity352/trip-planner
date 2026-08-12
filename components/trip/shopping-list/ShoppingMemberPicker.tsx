"use client";

/**
 * ShoppingMemberPicker — reusable crew picker (Task 5b).
 *
 * A `DropdownMenu` whose items are one-per-member (name via
 * `resolveMemberName`, never `.email`), with an optional leading "Open —
 * no one" item that selects `null`. Shared by two call sites on
 * `ShoppingItemCard`:
 *
 *   - Assign/Re-assign (`includeOpenNoOne: true`) — a menu item on the
 *     `⋯` overflow menu sets a card-level `open` flag; this component is
 *     then rendered with a CONTROLLED `open` prop so the picker appears
 *     already expanded (no second click on its own trigger needed).
 *   - Who-completed (`includeOpenNoOne: false`) — same controlled-open
 *     pattern, plus `defaultMemberId` to mark the on-hook member per spec
 *     §6's "default-highlighting": `aria-current="true"` for assistive
 *     tech, AND a visible leading "•" marker + `font-medium` — neutral
 *     ink only, no red/green — since `aria-current` alone carries no
 *     default browser styling.
 *
 * `ShoppingReopenForm` uses it a THIRD way — uncontrolled (`open` /
 * `onOpenChange` omitted), a normal self-toggling trigger the user
 * clicks directly, since that flow already has its own explicit assign
 * control inside an inline panel.
 */

import * as React from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { resolveMemberName } from "@/lib/utils/member-display";
import { SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";
import type { TripMember } from "@/lib/db/types";

export interface ShoppingMemberPickerProps {
  members: TripMember[];
  memberMap: ReadonlyMap<string, TripMember>;
  onSelect: (memberId: string | null) => void;
  /** Leading "Open — no one" item that selects `null`. */
  includeOpenNoOne: boolean;
  /** Trigger label — also the default aria-label unless `triggerAriaLabel` is given. */
  triggerLabel: string;
  triggerAriaLabel?: string;
  /**
   * Id of an external visual label (e.g. `ShoppingReopenForm`'s static
   * "Assign" span) to associate via `aria-describedby`. Deliberately
   * `aria-describedby`, not `aria-labelledby` — the latter would REPLACE
   * the trigger's own accessible name (which carries the live selected
   * value, e.g. "Winston") with just the static label text, losing the
   * current-value information. `aria-describedby` adds the static label
   * as supplementary context without touching the name.
   */
  triggerDescribedBy?: string;
  /** On-hook member to default-highlight (who-completed picker only). */
  defaultMemberId?: string | null;
  disabled?: boolean;
  /** Omit for an uncontrolled, self-toggling trigger. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

export function ShoppingMemberPicker({
  members,
  memberMap,
  onSelect,
  includeOpenNoOne,
  triggerLabel,
  triggerAriaLabel,
  triggerDescribedBy,
  defaultMemberId = null,
  disabled = false,
  open: controlledOpen,
  onOpenChange,
  className,
}: ShoppingMemberPickerProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;

  const handleOpenChange = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const handleSelect = (memberId: string | null) => {
    handleOpenChange(false);
    onSelect(memberId);
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label={triggerAriaLabel ?? triggerLabel}
        aria-describedby={triggerDescribedBy}
        className={cn(
          "text-foreground underline underline-offset-2 disabled:opacity-60",
          className
        )}
      >
        {triggerLabel}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4}>
        {includeOpenNoOne ? (
          <DropdownMenuItem onClick={() => handleSelect(null)}>
            {SHOPPING_LIST_UI_STRINGS.assignOpenNoOne}
          </DropdownMenuItem>
        ) : null}
        {members.map((member) => {
          const isDefault = defaultMemberId === member.id;
          return (
            <DropdownMenuItem
              key={member.id}
              aria-current={isDefault ? "true" : undefined}
              className={cn(isDefault && "font-medium")}
              onClick={() => handleSelect(member.id)}
            >
              {/* Visible default affordance (spec §6) — `aria-current`
                  alone has no default styling, so pair it with a leading
                  marker + emphasis. Neutral ink only, no red/green. */}
              <span aria-hidden className="mr-1 inline-block w-3">
                {isDefault ? "•" : null}
              </span>
              {resolveMemberName(memberMap, member.id)}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
