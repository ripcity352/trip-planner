"use client";

/**
 * StartRideSheet (#581) — the inline "start a ride" form. Opened either
 * SEEDED from a ride-share cluster (airport + the clustered members
 * pre-checked) or BLANK from the persistent manual affordance (only the
 * viewer pre-checked). One component, two initial-state shapes.
 *
 * "recommend, don't assign" (rule #8): the seeded riders are pre-checked
 * SUGGESTIONS you can deselect (the guy renting a car) — nothing is written
 * until you tap Start ride.
 *
 * "use client" — local form state + createRideGroupWithRiders, then onCreated
 * (router.refresh).
 */

import * as React from "react";

import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { callAction } from "@/lib/ui/call-action";
import { createRideGroupWithRiders } from "@/lib/actions/ride-groups";
import { AirportPicker } from "./airport-picker";
import type { TravelLegDirection } from "@/lib/db/types";

/** A member who can be seated in the ride (includes the viewer, as "You"). */
export interface RiderOption {
  id: string;
  name: string;
}

export interface StartRideSheetProps {
  tripId: string;
  direction: TravelLegDirection;
  /** Seed airport (from a cluster) — undefined for a manual ride. */
  seedAirport?: string;
  /** Members pre-checked on open (cluster members, or just the viewer). */
  seedMemberIds: ReadonlyArray<string>;
  /** All selectable riders (non-declined members; viewer included as "You"). */
  riderOptions: ReadonlyArray<RiderOption>;
  onCreated?: () => void;
  onCancel?: () => void;
}

export function StartRideSheet({
  tripId,
  direction,
  seedAirport,
  seedMemberIds,
  riderOptions,
  onCreated,
  onCancel,
}: StartRideSheetProps) {
  const [airport, setAirport] = React.useState<string | undefined>(seedAirport);
  const [selected, setSelected] = React.useState<ReadonlyArray<string>>(
    () => [...seedMemberIds]
  );
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const keyRef = React.useRef<string | null>(null);
  if (keyRef.current === null) keyRef.current = crypto.randomUUID();

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const airportLabel =
    direction === "outbound"
      ? M3_UI_STRINGS.rideGroup_sheet_airport_label_outbound
      : M3_UI_STRINGS.rideGroup_sheet_airport_label_inbound;

  const submit = () => {
    if (selected.length === 0) return;
    setErrorKey(null);
    startTransition(async () => {
      const result = await callAction(() =>
        createRideGroupWithRiders(
          {
            tripId,
            direction,
            airport: airport?.trim() ? airport.trim() : null,
            riderTripMemberIds: [...selected],
          },
          keyRef.current as string
        )
      );
      if (!result.ok) {
        setErrorKey(result.errorKey);
        return;
      }
      onCreated?.();
    });
  };

  return (
    <div className="border-border flex flex-col gap-3 rounded-sm border p-3">
      <h3 className="text-sm font-medium">{M3_UI_STRINGS.rideGroup_sheet_title}</h3>

      <AirportPicker
        id={`start-ride-airport-${direction}`}
        label={airportLabel}
        value={airport}
        onChange={setAirport}
        disabled={isPending}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-foreground text-xs font-medium">
          {M3_UI_STRINGS.rideGroup_sheet_riders_label}
        </legend>
        <div className="flex flex-wrap gap-2">
          {riderOptions.map((r) => {
            const checked = selected.includes(r.id);
            return (
              <label
                key={r.id}
                className={cn(
                  "focus-within:ring-ring inline-flex cursor-pointer items-center gap-2 rounded-xs border px-3 py-1 text-sm",
                  "focus-within:ring-2 focus-within:ring-offset-2",
                  checked
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground",
                  isPending && "cursor-not-allowed opacity-60"
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  disabled={isPending}
                  onChange={() => toggle(r.id)}
                />
                {r.name}
              </label>
            );
          })}
        </div>
      </fieldset>

      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
          {ERRORS[errorKey]}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={isPending || selected.length === 0}
          className={cn(
            "focus-visible:ring-ring bg-primary text-primary-foreground h-9 rounded-xs px-4 text-sm font-medium",
            "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          {M3_UI_STRINGS.rideGroup_sheet_submit}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="text-muted-foreground hover:text-foreground h-9 px-2 text-sm"
        >
          {M3_UI_STRINGS.rideGroup_cancel}
        </button>
      </div>
    </div>
  );
}
