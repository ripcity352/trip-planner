"use client";

/**
 * ItemRsvpChip — 2-state silent opt-out chip for per-item RSVP (#38).
 *
 * Optimistic local state pattern (same as rsvp-toggle.tsx):
 *   1. Click → set local state immediately
 *   2. Generate a fresh idempotency key (UUID)
 *   3. Call setItemRsvp
 *   4. On error → roll back and surface an inline alert
 *
 * `null` initialStatus means the member inherits the day-level RSVP
 * (no override row exists). Both chips render as unselected in that state.
 *
 * Opt-outs are silent — no notification, no peer visibility (M3 ADR).
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { setItemRsvp } from "@/lib/actions/itinerary-rsvp";
import type { ItineraryItemRsvpStatus } from "@/lib/db/types";

type LocalStatus = ItineraryItemRsvpStatus | null;

interface ChipDef {
  status: ItineraryItemRsvpStatus;
  label: string;
}

const CHIPS: ReadonlyArray<ChipDef> = [
  { status: "going", label: M3_UI_STRINGS.itinerary_rsvp_going_chip },
  { status: "skipping", label: M3_UI_STRINGS.itinerary_rsvp_skip_chip },
];

export interface ItemRsvpChipProps {
  itemId: string;
  initialStatus: ItineraryItemRsvpStatus | null;
}

export function ItemRsvpChip({ itemId, initialStatus }: ItemRsvpChipProps) {
  const [status, setStatus] = React.useState<LocalStatus>(initialStatus);
  const [confirmedStatus, setConfirmedStatus] =
    React.useState<LocalStatus>(initialStatus);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const handleClick = React.useCallback(
    (next: ItineraryItemRsvpStatus) => {
      // Short-circuit if already confirmed at this state with no error
      if (status === next && confirmedStatus === next && errorKey === null) {
        return;
      }

      const previousStatus = status;
      setStatus(next);
      setErrorKey(null);

      const idempotencyKey = crypto.randomUUID();

      startTransition(async () => {
        try {
          const result = await setItemRsvp(
            { itemId, status: next },
            idempotencyKey
          );

          if (!result.ok) {
            setStatus(previousStatus);
            setErrorKey(result.errorKey);
            return;
          }

          setStatus(result.status);
          setConfirmedStatus(result.status);
        } catch (err) {
          console.error("[item-rsvp-chip] setItemRsvp threw:", err);
          setStatus(previousStatus);
          setErrorKey("network");
        }
      });
    },
    [status, confirmedStatus, errorKey, itemId]
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="group"
        aria-label="Your spot on this item"
        className="flex flex-wrap items-center gap-2"
      >
        {CHIPS.map((chip) => {
          const isActive = status === chip.status;
          return (
            <button
              key={chip.status}
              type="button"
              aria-pressed={isActive}
              disabled={isPending}
              onClick={() => handleClick(chip.status)}
              className={cn(
                "focus-visible:ring-ring inline-flex h-11 items-center rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {chip.label}
            </button>
          );
        })}
      </div>
      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-xs")}>
          {ERRORS[errorKey]}
        </p>
      ) : null}
    </div>
  );
}
