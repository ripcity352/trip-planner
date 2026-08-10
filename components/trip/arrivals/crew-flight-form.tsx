"use client";

/**
 * CrewFlightForm (#574 follow-up) — log a shared flight the crew is on,
 * WITHOUT requiring the person entering it to be a passenger. Enter the
 * flight once, pick who's on it; each selected passenger gets a pending,
 * ATTRIBUTED leg they confirm on their own arrivals view (rule #8 — opt-in,
 * never silently assumed).
 *
 * Any trip member can use this (not organizer-gated) — the person with the
 * booking email is usually a regular attendee. Safe because every fanned-out
 * leg is attributed + forgery-proof (RLS) + dismissible.
 *
 * Splits the selected passengers: the viewer themselves (if picked) gets a
 * normal self-leg via upsertTravelLeg (written_by NULL); everyone else gets
 * an attributed tag via tagCoTravelersAction. Both writes reuse a stable
 * idempotency key, so a retry after a partial failure replays rather than
 * duplicating (no confirmation_code / notes collected — a crew flight isn't
 * a personal booking; PNR stays private per #505).
 *
 * Mounted on both the arrivals page and the roster (per the #574 follow-up).
 */

import * as React from "react";

import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { fromLocalInputValue } from "@/lib/utils/format-trip-tz";
import { callAction } from "@/lib/ui/call-action";
import {
  upsertTravelLeg,
  tagCoTravelersAction,
} from "@/lib/actions/travel-legs";
import type { TravelLegDirection } from "@/lib/db/types";
import { AirlinePicker, type AirlinePickerValue } from "./airline-picker";

/** A member who can be on a crew flight. `isYou` flags the viewer. */
export interface CrewFlightCandidate {
  /** trip_member_id. */
  id: string;
  name: string;
  isYou: boolean;
}

export interface CrewFlightFormProps {
  tripId: string;
  /** IANA tz from `trips.timezone` — the one time is wall-clock in it (#382). */
  tripTimezone: string;
  /** The viewer's own trip_member_id — picked-self routes to a self-leg. */
  viewerTripMemberId: string;
  /** All eligible passengers (non-declined members, incl. the viewer). */
  candidates: ReadonlyArray<CrewFlightCandidate>;
  /** Called after a write (to refresh) or a cancel (didWrite=false). */
  onDone: (didWrite: boolean) => void;
}

export function CrewFlightForm({
  tripId,
  tripTimezone,
  viewerTripMemberId,
  candidates,
  onDone,
}: CrewFlightFormProps) {
  const [direction, setDirection] =
    React.useState<TravelLegDirection>("inbound");
  const [time, setTime] = React.useState("");
  const [airport, setAirport] = React.useState("");
  const [airline, setAirline] = React.useState<AirlinePickerValue>({});
  const [selected, setSelected] = React.useState<ReadonlyArray<string>>([]);

  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [timeError, setTimeError] = React.useState(false);
  const [passengersError, setPassengersError] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  // Stable idempotency keys across retries (lazy — crypto is client-only), so
  // a retry after a partial failure replays both writes instead of duplicating.
  const keysRef = React.useRef<{ own: string; tag: string } | null>(null);
  if (keysRef.current === null) {
    keysRef.current = { own: crypto.randomUUID(), tag: crypto.randomUUID() };
  }

  const isInbound = direction === "inbound";

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const submit = () => {
    setErrorKey(null);
    const iso = fromLocalInputValue(time, tripTimezone);
    const noTime = !iso;
    const noPassengers = selected.length === 0;
    setTimeError(noTime);
    setPassengersError(noPassengers);
    if (noTime || noPassengers) return;

    const selfPicked = selected.includes(viewerTripMemberId);
    const others = selected.filter((id) => id !== viewerTripMemberId);
    // Non-null after the lazy init above. Hoisted so the two writes share
    // one reference (no repeated non-null assertions).
    const keys = keysRef.current!;

    // Shared flight facts — no confirmation_code / notes (#505 PNR privacy).
    const flight = {
      kind: "flight" as const,
      direction,
      departAt: isInbound ? null : iso,
      arriveAt: isInbound ? iso : null,
      airport: airport.trim() || null,
      carrier: airline.carrier || null,
      airlineIata: airline.airlineIata || null,
      flightNumber: airline.flightNumber || null,
    };

    // Stable keys mean a retry after a partial failure replays cleanly (no
    // duplicate self-leg, already-tagged targets 23505→counted). Trade-off:
    // fields EDITED between a failed submit and a retry don't rewrite an
    // already-written row (insert-only, no update-on-conflict) — acceptable
    // since the panel closes on full success, so an edit-then-retry is rare.
    startTransition(async () => {
      // 1. The viewer's own leg (only if they picked themselves).
      if (selfPicked) {
        const ownResult = await callAction(() =>
          upsertTravelLeg({ tripId, ...flight }, keys.own)
        );
        if (!ownResult.ok) {
          setErrorKey(ownResult.errorKey);
          return;
        }
      }

      // 2. Attributed pending tags for everyone else.
      if (others.length > 0) {
        const tagResult = await callAction(() =>
          tagCoTravelersAction(
            { tripId, targetTripMemberIds: [...others], ...flight },
            keys.tag
          )
        );
        if (!tagResult.ok) {
          setErrorKey(tagResult.errorKey);
          return;
        }
      }

      onDone(true);
    });
  };

  const inputClass = cn(
    "w-full rounded-xs border border-border bg-background px-3 py-2 text-sm",
    "placeholder:text-muted-foreground",
    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
    "disabled:cursor-not-allowed disabled:opacity-60"
  );
  const labelClass = "block text-sm font-medium text-foreground mb-1";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">
        {M3_UI_STRINGS.crewFlight_intro}
      </p>

      {/* Direction — getting there vs heading home */}
      <div
        role="group"
        aria-label={M3_UI_STRINGS.crewFlight_direction_group_label}
        className="flex gap-2"
      >
        {(["inbound", "outbound"] as const).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={direction === d}
            disabled={isPending}
            onClick={() => setDirection(d)}
            className={cn(
              "focus-visible:ring-ring h-9 flex-1 rounded-xs border px-3 text-sm font-medium",
              "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-60",
              direction === d
                ? "border-primary bg-primary/10 text-foreground"
                : "border-border bg-background text-muted-foreground"
            )}
          >
            {d === "inbound"
              ? M3_UI_STRINGS.crewFlight_direction_inbound
              : M3_UI_STRINGS.crewFlight_direction_outbound}
          </button>
        ))}
      </div>

      {/* The one trip-city-side time */}
      <div>
        <label htmlFor="crew-leg-time" className={labelClass}>
          {isInbound
            ? M3_UI_STRINGS.crewFlight_arrive_label
            : M3_UI_STRINGS.crewFlight_depart_label}
        </label>
        <input
          id="crew-leg-time"
          type="datetime-local"
          value={time}
          onChange={(e) => setTime(e.target.value)}
          disabled={isPending}
          className={inputClass}
        />
        {timeError ? (
          <p role="alert" className={cn(ERROR_LINE_CLASS, "mt-1 text-sm")}>
            {M3_UI_STRINGS.crewFlight_time_required}
          </p>
        ) : null}
      </div>

      {/* Airport */}
      <div>
        <label htmlFor="crew-leg-airport" className={labelClass}>
          {M3_UI_STRINGS.crewFlight_airport_label}
        </label>
        <input
          id="crew-leg-airport"
          type="text"
          value={airport}
          onChange={(e) => setAirport(e.target.value)}
          disabled={isPending}
          className={inputClass}
        />
      </div>

      {/* Airline / flight designator */}
      <AirlinePicker value={airline} onChange={setAirline} disabled={isPending} />

      {/* Passengers */}
      <fieldset className="flex flex-col gap-2">
        <legend className={labelClass}>
          {M3_UI_STRINGS.crewFlight_passengers_label}
        </legend>
        <div className="flex flex-wrap gap-2">
          {candidates.map((c) => {
            const checked = selected.includes(c.id);
            return (
              <label
                key={c.id}
                className={cn(
                  "focus-within:ring-ring inline-flex cursor-pointer items-center gap-2 rounded-xs border px-3 py-1.5 text-sm",
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
                  onChange={() => toggle(c.id)}
                />
                {c.isYou
                  ? `${c.name} (${M3_UI_STRINGS.crewFlight_passengers_you})`
                  : c.name}
              </label>
            );
          })}
        </div>
        {passengersError ? (
          <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
            {M3_UI_STRINGS.crewFlight_passengers_required}
          </p>
        ) : null}
      </fieldset>

      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
          {ERRORS[errorKey]}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={isPending}
          className={cn(
            "focus-visible:ring-ring h-11 rounded-xs bg-primary px-5 text-sm font-medium text-primary-foreground",
            "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          {M3_UI_STRINGS.crewFlight_submit}
        </button>
        <button
          type="button"
          onClick={() => onDone(false)}
          disabled={isPending}
          className={cn(
            "focus-visible:ring-ring h-11 rounded-xs border border-border bg-muted px-5 text-sm font-medium text-muted-foreground",
            "hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          {M3_UI_STRINGS.crewFlight_cancel}
        </button>
      </div>
    </div>
  );
}
