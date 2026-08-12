"use client";

/**
 * ShoppingItemMenu — the `⋯` overflow menu on a shopping-list row.
 *
 * Extracted from `ShoppingItemCard` in Task 5b to keep the card under the
 * file-size mandate. Presentation + the menu's own open/purge-armed state
 * live here; every mutation is a callback prop the card wires to
 * `runMutation` — this component never imports a server action directly.
 *
 * Assign/Re-assign (added in 5b, spec §6 rule #8): a non-terminal-only
 * item that CLOSES this menu and hands off to the card via
 * `onAssignClick` — the card then renders a controlled-open
 * `ShoppingMemberPicker` itself (see `ShoppingItemCard`'s module header
 * on the "close here, auto-open there" pattern). This menu never renders
 * the picker directly, so it stays a pure leaf like
 * `AnnouncementCardActions`.
 */

import * as React from "react";
import { MoreVertical } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";

export interface ShoppingItemMenuProps {
  isTerminal: boolean;
  /** Whether the item currently has a claimer — flips Assign…/Re-assign…. */
  isClaimed: boolean;
  canDelete: boolean;
  /**
   * Complete the item — the same handler the leading glyph and the primary
   * button route through (completes as self if the viewer owns the claim,
   * else opens the who-completed picker). Surfaced here as a discoverable
   * labelled path since the glyph reads as a status dot, not a button (#606
   * follow-up). Non-terminal rows only.
   */
  onComplete: () => void;
  onRemove: () => void;
  onAssignClick: () => void;
  onPurge: () => void;
}

export function ShoppingItemMenu({
  isTerminal,
  isClaimed,
  canDelete,
  onComplete,
  onRemove,
  onAssignClick,
  onPurge,
}: ShoppingItemMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [purgeArmed, setPurgeArmed] = React.useState(false);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setPurgeArmed(false);
  };

  const handleCompleteClick = () => {
    setOpen(false);
    onComplete();
  };

  const handleAssignItemClick = () => {
    setOpen(false);
    onAssignClick();
  };

  const handleRemoveClick = () => {
    setOpen(false);
    onRemove();
  };

  const handlePurgeClick = () => {
    if (!purgeArmed) {
      setPurgeArmed(true);
      return;
    }
    setPurgeArmed(false);
    setOpen(false);
    onPurge();
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger
        aria-label={SHOPPING_LIST_UI_STRINGS.itemMenu_aria}
        className={cn(
          "text-muted-foreground hover:text-foreground rounded-xs",
          "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        )}
      >
        <MoreVertical aria-hidden className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4}>
        {!isTerminal ? (
          <DropdownMenuItem onClick={handleCompleteClick}>
            {SHOPPING_LIST_UI_STRINGS.completeAction}
          </DropdownMenuItem>
        ) : null}
        {!isTerminal ? (
          <DropdownMenuItem onClick={handleAssignItemClick}>
            {isClaimed
              ? SHOPPING_LIST_UI_STRINGS.reassignAction
              : SHOPPING_LIST_UI_STRINGS.assignAction}
          </DropdownMenuItem>
        ) : null}
        {!isTerminal ? (
          <DropdownMenuItem onClick={handleRemoveClick}>
            {SHOPPING_LIST_UI_STRINGS.deleteCta}
          </DropdownMenuItem>
        ) : null}
        {canDelete ? (
          <DropdownMenuItem
            data-testid="confirm-purge"
            variant="destructive"
            closeOnClick={false}
            onClick={handlePurgeClick}
          >
            {purgeArmed
              ? SHOPPING_LIST_UI_STRINGS.itemDeleteConfirm
              : SHOPPING_LIST_UI_STRINGS.menuPurge}
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
