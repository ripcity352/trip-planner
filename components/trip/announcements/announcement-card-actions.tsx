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
 *
 * Error display: `errorKey` is an optional *controlled* prop. Every
 * optimistic update in `AnnouncementList` unmounts (delete) or moves
 * (pin, between the regular feed and the collapsed pinned banner) the
 * instance that triggered the mutation, so a purely-local error state
 * set on failure lands on an already-unmounted component and is a
 * silent no-op — exactly the drunk-user-on-bad-signal case the copy
 * exists for. `AnnouncementList` hoists a per-announcement error map
 * and passes it back down as `errorKey` so the alert survives the
 * remount. When `errorKey` is omitted (e.g. these unit tests render
 * the leaf standalone), the component falls back to internal state.
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
  /**
   * Controlled error display, hoisted by `AnnouncementList` so it
   * survives the optimistic unmount/move this component undergoes on
   * delete/pin. `undefined` (the default) falls back to internal
   * state — used by the standalone unit tests below.
   */
  errorKey?: ErrorKey | null;
}

export function AnnouncementCardActions({
  pinned,
  onPin,
  onDelete,
  errorKey: controlledErrorKey,
}: AnnouncementCardActionsProps) {
  const [open, setOpen] = React.useState(false);
  const [deleteArmed, setDeleteArmed] = React.useState(false);
  const [localErrorKey, setLocalErrorKey] = React.useState<ErrorKey | null>(
    null
  );
  const errorKey =
    controlledErrorKey !== undefined ? controlledErrorKey : localErrorKey;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setDeleteArmed(false);
  };

  const handlePinClick = () => {
    setLocalErrorKey(null);
    void onPin(!pinned).then((err) => {
      if (err) setLocalErrorKey(err);
    });
  };

  const handleDeleteClick = () => {
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setLocalErrorKey(null);
    setDeleteArmed(false);
    setOpen(false);
    void onDelete().then((err) => {
      if (err) setLocalErrorKey(err);
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
