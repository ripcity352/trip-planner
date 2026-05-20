/**
 * TravelLegCard — renders a single travel leg in the arrivals manifest.
 *
 * Server Component. Displays kind label, depart/arrive datetimes, carrier,
 * confirmation code, notes. Owner sees an edit affordance (TravelLegFormSheet);
 * non-owners see read-only card.
 *
 * Visibility rule: All trip members can read all legs (RLS allows trip-wide
 * SELECT). Edit is owner-only — the UI hides the affordance as a UX detail;
 * the server action enforces it as a security gate.
 */

import { format, parseISO } from "date-fns";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { TravelLegFormSheet } from "./travel-leg-form-sheet";
import type { TravelLeg, TravelLegKind } from "@/lib/db/types";

const KIND_LABELS: Record<TravelLegKind, string> = {
  flight: M3_UI_STRINGS.arrivals_leg_form_kind_flight,
  train: M3_UI_STRINGS.arrivals_leg_form_kind_train,
  drive: M3_UI_STRINGS.arrivals_leg_form_kind_drive,
  other: M3_UI_STRINGS.arrivals_leg_form_kind_other,
};

// Kind → simple text icon. No emoji deps — text keeps it accessible.
const KIND_ICON: Record<TravelLegKind, string> = {
  flight: "✈️",
  train: "🚆",
  drive: "🚗",
  other: "🧳",
};

export interface TravelLegCardProps {
  leg: TravelLeg;
  /** The viewing member's own trip_member_id — used to decide edit affordance. */
  myTripMemberId: string;
  /** Display name of the member who owns this leg. */
  ownerName: string;
}

export function TravelLegCard({
  leg,
  myTripMemberId,
  ownerName,
}: TravelLegCardProps) {
  const isOwner = leg.trip_member_id === myTripMemberId;

  return (
    <article className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3">
      {/* Header: kind icon + label + owner name + edit affordance */}
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-base leading-none">
          {KIND_ICON[leg.kind]}
        </span>
        <span className="text-sm font-semibold">{KIND_LABELS[leg.kind]}</span>
        <span className="text-muted-foreground ml-auto text-xs">
          {ownerName}
        </span>
        {isOwner ? (
          <TravelLegFormSheet tripId={leg.trip_id} leg={leg} />
        ) : null}
      </div>

      {/* Depart + Arrive row */}
      {(leg.depart_at || leg.arrive_at) ? (
        <div className="flex flex-wrap gap-4">
          {leg.depart_at ? (
            <div className="flex flex-col">
              <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                {M3_UI_STRINGS.arrivals_leg_form_depart_label}
              </span>
              <span className="text-sm">
                {formatDatetime(leg.depart_at)}
              </span>
            </div>
          ) : null}
          {leg.arrive_at ? (
            <div className="flex flex-col">
              <span className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
                {M3_UI_STRINGS.arrivals_leg_form_arrive_label}
              </span>
              <span className="text-sm">
                {formatDatetime(leg.arrive_at)}
              </span>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Carrier */}
      {leg.carrier ? (
        <p className="text-sm">{leg.carrier}</p>
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

function formatDatetime(iso: string): string {
  try {
    return format(parseISO(iso), "MMM d, h:mm a");
  } catch {
    return iso;
  }
}
