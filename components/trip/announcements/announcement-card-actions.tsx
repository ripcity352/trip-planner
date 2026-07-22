"use client";

/**
 * AnnouncementCardActions — organizer-only overflow menu (#393).
 *
 * Pure UI leaf: the dropdown, the pin/unpin item, and the two-tap
 * delete confirm. Mutation + optimistic bookkeeping (the array the
 * pinned banner and regular feed both derive from) stays in
 * `AnnouncementList`, which is why this component receives `onPin` /
 * `onDelete` as callbacks that already do the optimistic-update +
 * server-call + rollback dance and resolve to the failure `ErrorKey`
 * (or `null` on success) — same shape as `ReactionRow`'s handler.
 *
 * Delete confirm is a bare two-tap on the same menu item (per the doge
 * cut: no AlertDialog primitive) — first tap arms it (label swaps to
 * the confirm copy, menu stays open via `closeOnClick={false}`),
 * second tap commits and closes.
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
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";

export interface AnnouncementCardActionsProps {
  pinned: boolean;
  /** Resolves the desired end state; returns the failure key, or null on success. */
  onPin: (pinned: boolean) => Promise<ErrorKey | null>;
  /** Returns the failure key, or null on success. */
  onDelete: () => Promise<ErrorKey | null>;
}

export function AnnouncementCardActions({
  pinned,
  onPin,
  onDelete,
}: AnnouncementCardActionsProps) {
  const [open, setOpen] = React.useState(false);
  const [deleteArmed, setDeleteArmed] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setDeleteArmed(false);
  };

  const handlePinClick = () => {
    setErrorKey(null);
    void onPin(!pinned).then((err) => {
      if (err) setErrorKey(err);
    });
  };

  const handleDeleteClick = () => {
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setErrorKey(null);
    setDeleteArmed(false);
    setOpen(false);
    void onDelete().then((err) => {
      if (err) setErrorKey(err);
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <DropdownMenu open={open} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger
          aria-label={M3_UI_STRINGS.announcements_menu_aria}
          className={cn(
            "text-muted-foreground hover:text-foreground rounded-xs",
            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          )}
        >
          <MoreVertical aria-hidden className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={4}>
          <DropdownMenuItem onClick={handlePinClick}>
            {pinned
              ? M3_UI_STRINGS.announcements_menu_unpin
              : M3_UI_STRINGS.announcements_menu_pin}
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="confirm-delete"
            variant="destructive"
            closeOnClick={false}
            onClick={handleDeleteClick}
          >
            {deleteArmed
              ? M3_UI_STRINGS.announcements_menu_delete_confirm
              : M3_UI_STRINGS.announcements_menu_delete}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-xs")}>
          {ERRORS[errorKey]}
        </p>
      ) : null}
    </div>
  );
}
