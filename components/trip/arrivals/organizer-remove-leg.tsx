"use client";

/**
 * OrganizerRemoveLeg (#615) — quiet organizer-only "Remove" control for
 * another member's travel leg. Full card only (rule #11 — a quiet
 * affordance, never an access-denied gate); TravelLegCard only mounts
 * this when `viewerIsOrganizer && !isOwner`, so anyone else simply never
 * sees the control.
 *
 * Two-tap destructive confirm mirrors AnnouncementCardActions' delete
 * item (`deleteArmed` state, armed label swaps to the confirm copy) —
 * there's no dropdown menu here, just an inline button, but the arm/
 * confirm mechanics are identical.
 *
 * RLS is the real gate: the new "travel legs: organizer delete" policy
 * (migration 20260814010500) decides who can actually delete which row.
 * `deleteTravelLeg` is unchanged — it deletes by id and lets RLS decide,
 * re-deriving auth server-side — this component is a UI affordance on
 * top of that, not a security boundary.
 *
 * Auto-disarm (post-review fix): unlike the dropdown-hosted announcement
 * pattern (which disarms on menu close), this inline control has no
 * natural "close" event, so an armed-forever control would let a later,
 * unrelated tap commit an accidental delete. A short timeout resets
 * `armed` back to false; cleared on unmount and on commit.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { callAction } from "@/lib/ui/call-action";
import { deleteTravelLeg } from "@/lib/actions/travel-legs";

/** How long the armed "tap again to remove" state stays live before auto-disarming. */
const DISARM_MS = 4000;

export interface OrganizerRemoveLegProps {
  legId: string;
  onRemoved?: () => void;
}

export function OrganizerRemoveLeg({
  legId,
  onRemoved,
}: OrganizerRemoveLegProps) {
  const [armed, setArmed] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();
  const disarmTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const clearDisarmTimeout = () => {
    if (disarmTimeoutRef.current !== null) {
      clearTimeout(disarmTimeoutRef.current);
      disarmTimeoutRef.current = null;
    }
  };

  // Clear any pending disarm timer on unmount so it never fires against an
  // unmounted component.
  React.useEffect(() => clearDisarmTimeout, []);

  const handleClick = () => {
    if (!armed) {
      setArmed(true);
      clearDisarmTimeout();
      disarmTimeoutRef.current = setTimeout(() => {
        setArmed(false);
        disarmTimeoutRef.current = null;
      }, DISARM_MS);
      return;
    }
    clearDisarmTimeout();
    setErrorKey(null);
    setArmed(false);
    startTransition(async () => {
      const result = await callAction(() => deleteTravelLeg(legId));
      if (!result.ok) {
        setErrorKey(result.errorKey);
        return;
      }
      onRemoved?.();
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        data-testid="organizer-remove-leg"
        onClick={handleClick}
        disabled={isPending}
        className={cn(
          "shrink-0 text-xs",
          armed
            ? "text-destructive"
            : "text-muted-foreground hover:text-destructive",
          "focus-visible:ring-ring rounded-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-60"
        )}
      >
        {armed
          ? M3_UI_STRINGS.arrivals_organizer_remove_confirm
          : M3_UI_STRINGS.arrivals_organizer_remove}
      </button>
      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-xs")}>
          {ERRORS[errorKey]}
        </p>
      ) : null}
    </div>
  );
}
