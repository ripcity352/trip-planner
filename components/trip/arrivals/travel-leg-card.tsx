/**
 * TravelLegCard — renders a single travel leg in the arrivals manifest.
 *
 * Server Component. Displays kind label + flight designator (airline_iata +
 * flight_number, falling back to free-text carrier — #396), depart/arrive
 * datetimes, confirmation code, notes. Owner sees an edit affordance
 * (TravelLegFormSheet); non-owners see read-only card.
 *
 * Visibility rule: All trip members can read all legs (RLS allows trip-wide
 * SELECT). Edit is owner-only — the UI hides the affordance as a UX detail;
 * the server action enforces it as a security gate.
 *
 * Datetimes are rendered via `formatTripDateTime` (lib/utils/format-trip-tz)
 * which uses `formatInTimeZone` from date-fns-tz. This makes the output
 * deterministic across runtimes (server UTC vs browser-local) — fixing the
 * React #418 hydration mismatch (#254).
 */

import { Plane, Train, Car, Luggage } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { formatTripDateTime } from "@/lib/utils/format-trip-tz";
import { TravelLegFormSheet } from "./travel-leg-form-sheet";
import type { TravelLeg, TravelLegKind } from "@/lib/db/types";

const KIND_LABELS: Record<TravelLegKind, string> = {
  flight: M3_UI_STRINGS.arrivals_leg_form_kind_flight,
  train: M3_UI_STRINGS.arrivals_leg_form_kind_train,
  drive: M3_UI_STRINGS.arrivals_leg_form_kind_drive,
  other: M3_UI_STRINGS.arrivals_leg_form_kind_other,
};

// Kind → SVG icon (lucide-react). Replaces emoji icons per design-system
// §581: emoji reserved for reactions / user-generated copy, app icons are SVG.
const KIND_ICON: Record<TravelLegKind, LucideIcon> = {
  flight: Plane,
  train: Train,
  drive: Car,
  other: Luggage,
};

export interface TravelLegCardProps {
  leg: TravelLeg;
  /** The viewing member's own trip_member_id — used to decide edit affordance. */
  myTripMemberId: string;
  /** Display name of the member who owns this leg. */
  ownerName: string;
  /**
   * IANA timezone string for the trip (e.g. `"America/New_York"`).
   * All departure/arrival times are rendered in this timezone via
   * `formatInTimeZone` — making output identical on SSR and CSR (#254).
   */
  tripTimezone: string;
}

export function TravelLegCard({
  leg,
  myTripMemberId,
  ownerName,
  tripTimezone,
}: TravelLegCardProps) {
  const isOwner = leg.trip_member_id === myTripMemberId;

  // #396: the M4 airline picker stores airline_iata + flight_number and
  // leaves free-text carrier null — prefer the structured pair ("UA 415"),
  // fall back to carrier for the free-text path (train/drive/other).
  const carrierLabel =
    [leg.airline_iata, leg.flight_number].filter(Boolean).join(" ") ||
    leg.carrier;

  // #477: free-text airport ("LAX") + optional inbound-only origin
  // ("from JFK") — the coordination facts the manifest heading promises.
  const airportLabel = leg.airport?.trim() || null;
  const originLabel =
    leg.direction === "inbound" && leg.origin_label?.trim()
      ? M3_UI_STRINGS.arrivals_card_from_template.replace(
          "{origin}",
          leg.origin_label.trim()
        )
      : null;

  return (
    <article className="flex flex-col gap-2 rounded-md border border-border bg-card px-4 py-3">
      {/* Header: kind icon + label + owner name + edit affordance */}
      <div className="flex items-center gap-2">
        {(() => {
          const Icon = KIND_ICON[leg.kind];
          return (
            <Icon
              aria-hidden
              className="h-4 w-4 text-muted-foreground"
              strokeWidth={2}
            />
          );
        })()}
        <span className="text-sm font-semibold">{KIND_LABELS[leg.kind]}</span>
        {carrierLabel ? (
          <span className="text-muted-foreground text-sm">{carrierLabel}</span>
        ) : null}
        {airportLabel ? (
          <span className="text-sm font-medium">{airportLabel}</span>
        ) : null}
        {originLabel ? (
          <span className="text-muted-foreground text-sm">{originLabel}</span>
        ) : null}
        <span className="text-muted-foreground ml-auto min-w-0 truncate text-xs">
          {ownerName}
        </span>
        {isOwner ? (
          <TravelLegFormSheet
            tripId={leg.trip_id}
            leg={leg}
            tripTimezone={tripTimezone}
          />
        ) : null}
      </div>

      {/* Depart + Arrive row */}
      {leg.depart_at || leg.arrive_at ? (
        <div className="flex flex-wrap gap-4">
          {leg.depart_at ? (
            <div className="flex flex-col">
              <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                {M3_UI_STRINGS.arrivals_leg_form_depart_label}
              </span>
              <span className="text-sm">
                {formatTripDateTime(leg.depart_at, tripTimezone)}
              </span>
            </div>
          ) : null}
          {leg.arrive_at ? (
            <div className="flex flex-col">
              <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                {M3_UI_STRINGS.arrivals_leg_form_arrive_label}
              </span>
              <span className="text-sm">
                {formatTripDateTime(leg.arrive_at, tripTimezone)}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Confirmation code */}
      {leg.confirmation_code ? (
        <p className="font-mono text-sm">{leg.confirmation_code}</p>
      ) : null}

      {/* Notes */}
      {leg.notes ? (
        <p className="text-muted-foreground text-xs">{leg.notes}</p>
      ) : null}
    </article>
  );
}
