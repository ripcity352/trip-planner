"use client";

import * as React from "react";

import { cn } from "@/lib/utils";
import { M2_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { setRsvpAction } from "@/lib/actions/rsvp";
import type { RsvpStatus } from "@/lib/db/types";

/**
 * 3-state RSVP chip group (#74).
 *
 * The component owns optimistic local state with rollback:
 *
 *   1. Click → set local state to the new status immediately
 *   2. Generate a fresh `crypto.randomUUID()` idempotency key
 *   3. Call `setRsvpAction`
 *   4. On error → roll back local state to the prior value and surface
 *      the matching `ERRORS[errorKey]` string in an inline message
 *
 * Why inline error vs a toast: we don't have a global toast surface
 * shipped yet. Inline `<p role="alert">` is the smallest landing pad
 * that keeps the failure visible without inventing infrastructure.
 *
 * Why not a `<form>` per chip: every chip needs to fire the same
 * server action with different `status` values, and `useTransition`
 * gives us the optimistic+pending UX a `<form>` can't on its own.
 */

type ChipStatus = Exclude<RsvpStatus, "pending">;

interface ChipDef {
  status: ChipStatus;
  label: string;
}

const CHIPS: ReadonlyArray<ChipDef> = [
  { status: "going", label: M2_UI_STRINGS.rsvp_chip_going },
  { status: "maybe", label: M2_UI_STRINGS.rsvp_chip_maybe },
  { status: "declined", label: M2_UI_STRINGS.rsvp_chip_declined },
];

export interface RsvpToggleProps {
  tripId: string;
  /**
   * Initial RSVP status. `pending` renders all three chips as
   * unselected — the user hasn't picked yet, and that surface honestly
   * reflects "no answer."
   */
  initialStatus: RsvpStatus;
}

export function RsvpToggle({ tripId, initialStatus }: RsvpToggleProps) {
  const [status, setStatus] = React.useState<RsvpStatus>(initialStatus);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const handleClick = React.useCallback(
    (next: ChipStatus) => {
      // Same-state click is a no-op — never re-fire the server action
      // for a click that doesn't change state. Saves a rate-limit slot
      // and a round-trip; matters when the user taps a chip multiple
      // times on bad cell signal.
      if (status === next) return;

      const previousStatus = status;
      // Optimistic: flip local state first so the chip lands instantly.
      setStatus(next);
      setErrorKey(null);

      const idempotencyKey = crypto.randomUUID();

      startTransition(async () => {
        try {
          const result = await setRsvpAction(
            { tripId, status: next },
            idempotencyKey
          );

          if (!result.ok) {
            // Roll back to whatever we had before the click.
            setStatus(previousStatus);
            setErrorKey(result.errorKey);
            return;
          }

          // Server is authoritative — if it returned a different
          // status (e.g. idempotency replay echoed the stored value),
          // we trust it over our optimistic guess.
          setStatus(result.status);
        } catch (err) {
          // The action contract is "never throws," but a thrown error
          // from the network boundary still needs a rollback path.
          console.error("[rsvp-toggle] setRsvpAction threw:", err);
          setStatus(previousStatus);
          setErrorKey("network");
        }
      });
    },
    [status, tripId]
  );

  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label="RSVP"
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
                "focus-visible:ring-ring inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
                // Active chip uses primary tokens; inactive ones the
                // muted surface so the toggle group reads at a glance
                // on the dashboard at 375px.
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
        <p
          role="alert"
          // text-destructive is a Tailwind/shadcn token — surfaces
          // the failure without inventing a new color rule.
          className="text-destructive text-sm"
        >
          {ERRORS[errorKey]}
        </p>
      ) : null}
    </div>
  );
}
