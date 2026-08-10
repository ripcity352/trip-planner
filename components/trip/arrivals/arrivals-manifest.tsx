"use client";

/**
 * ArrivalsManifest — client component that renders the two travel
 * sections (#477) and the add CTAs.
 *
 * Inbound ("Who's landing when" — the page <h1>): legs grouped by
 * trip-local landing day, plus a quiet computed ride-share line when 2+
 * people land at the same airport within an hour (no matching engine —
 * #118 stays open). Outbound: a quieter "Heading home" section, only
 * rendered when someone has logged a leg home.
 *
 * "use client" because it needs to trigger router.refresh() after a
 * successful mutation (TravelLegFormSheet calls onMutated → refresh).
 *
 * Consumes:
 *   - `legs` — pre-fetched by the page Server Component via `getTravelLegsByTrip`
 *   - `myTripMemberId` — resolved by the page to gate edit affordances
 *   - `tripMembers` — for display names on each card
 *   - `tripTimezone` — IANA tz string threaded to TravelLegCard so times
 *     render in trip-local time (#254), used here for day grouping, and
 *     threaded to TravelLegFormSheet so form input parses as trip-local
 *     time (#382)
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { parseISO } from "date-fns";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { resolveMemberName } from "@/lib/utils/member-display";
import { computeRideShareClusters } from "@/lib/utils/ride-share";
import { formatTripDayHeader } from "@/lib/utils/format-trip-tz";
import { TravelLegCard } from "./travel-leg-card";
import { TravelLegRow } from "./travel-leg-row";
import { ViewToggle, type ArrivalsView } from "./view-toggle";
import { TravelLegFormSheet } from "./travel-leg-form-sheet";
import type { MemberDay } from "@/lib/db/trip-member-days";
import type { TravelLeg, TripMember } from "@/lib/db/types";

// #579 — the Compact|Full choice persists across visits. Device/user-local
// (localStorage), read in useEffect so first paint is always the deterministic
// default (Compact) and never mismatches SSR (the #254 hydration lesson).
const ARRIVALS_VIEW_STORAGE_KEY = "pt:arrivalsView";

export interface ArrivalsManifestProps {
  tripId: string;
  legs: TravelLeg[];
  myTripMemberId: string;
  tripMembers: TripMember[];
  /** IANA timezone string for the trip (e.g. `"America/New_York"`). */
  tripTimezone: string;
  /** #525 — the viewer's own day rows + trip range for the post-save
   *  suggestion prompt (suggest, don't write). */
  myDays: MemberDay[];
  tripStartsAt: string | null;
  tripEndsAt: string | null;
}

interface DayGroup {
  key: string;
  label: string;
  legs: TravelLeg[];
}

/**
 * Group inbound legs by trip-local landing day, preserving the incoming
 * arrive_at ASC sort. Legacy inbound rows without a landing time group
 * under a trailing "Landing time TBD" bucket.
 */
function groupInboundByDay(
  legs: TravelLeg[],
  tripTimezone: string
): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const leg of legs) {
    let key = "tbd";
    let label: string = M3_UI_STRINGS.arrivals_inbound_time_tbd;
    if (leg.arrive_at) {
      const date = parseISO(leg.arrive_at);
      try {
        key = formatInTimeZone(date, tripTimezone, "yyyy-MM-dd");
        // Design-system day-header tier (#211, #579): lowercase mono `fri 14`.
        // Replaces the pre-#579 uppercase `Fri, Aug 14` eyebrow (an anti-tell)
        // — both views now share this register.
        label = formatTripDayHeader(leg.arrive_at, tripTimezone);
      } catch {
        // Unparseable stored timestamp — fall through to the TBD bucket.
      }
    }
    const existing = groups.find((g) => g.key === key);
    if (existing) {
      existing.legs = [...existing.legs, leg];
    } else {
      groups.push({ key, label, legs: [leg] });
    }
  }
  return groups;
}

export function ArrivalsManifest({
  tripId,
  legs,
  myTripMemberId,
  tripMembers,
  tripTimezone,
  myDays,
  tripStartsAt,
  tripEndsAt,
}: ArrivalsManifestProps) {
  const router = useRouter();

  // #579 — Compact (default) vs Full density. Default Compact on first paint;
  // hydrate the persisted preference after mount so SSR and CSR agree.
  const [view, setView] = useState<ArrivalsView>("compact");
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(ARRIVALS_VIEW_STORAGE_KEY);
      if (stored === "full" || stored === "compact") {
        // Intentional post-hydration setState: the preference is client-only
        // (localStorage), so it MUST be applied after mount. A render-time
        // initializer would render "full" on the client while SSR rendered
        // the default "compact" → the #254 hydration-mismatch class.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setView(stored);
      }
    } catch {
      // Private-mode / disabled storage — just keep the default.
    }
  }, []);
  const handleViewChange = (next: ArrivalsView) => {
    setView(next);
    try {
      window.localStorage.setItem(ARRIVALS_VIEW_STORAGE_KEY, next);
    } catch {
      // Non-fatal — the choice just won't persist to the next visit.
    }
  };

  const handleMutated = () => {
    router.refresh();
  };

  // Build a lookup: trip_member_id → TripMember. resolveMemberName reads
  // display_name and falls back to "Guest" — email/id never surface in the UI.
  const memberNameMap = new Map(tripMembers.map((m) => [m.id, m]));

  // #574 — who can be tagged onto a shared flight: every trip member except
  // the viewer and trip-level decliners (#475 — don't offer to tag someone
  // who said they're not coming). Names via resolveMemberName (never id/email).
  const tagCandidates = tripMembers
    .filter((m) => m.id !== myTripMemberId && m.rsvp_status !== "declined")
    .map((m) => ({ id: m.id, name: resolveMemberName(memberNameMap, m.id) }));

  // #574 follow-up — per-card "add who's on this flight": for each flight,
  // who could still be added. A member is a candidate for a leg unless they
  // declined the trip, or they already have a leg on the SAME flight (same
  // airline + flight number). Keyed lookup so each card gets its own list
  // (the tagger adds OTHERS; the confirm gate keeps it opt-in).
  // Candidates never include the viewer — adding yourself to a flight is the
  // normal "log your travel" flow (and RLS rejects target == writer, rule #8).
  const nonDeclined = tripMembers.filter(
    (m) => m.rsvp_status !== "declined" && m.id !== myTripMemberId
  );
  // flight key → set of member ids already on it. Keyed on airline + number +
  // direction so an inbound and outbound leg sharing a number aren't merged.
  // Legs missing the airline or number can't be matched, so only their own
  // owner counts (unique per-leg key).
  const flightKey = (leg: TravelLeg): string =>
    leg.airline_iata && leg.flight_number
      ? `${leg.airline_iata}|${leg.flight_number}|${leg.direction}`
      : `leg:${leg.id}`;
  const membersByFlightKey = new Map<string, Set<string>>();
  for (const leg of legs) {
    const key = flightKey(leg);
    const set = membersByFlightKey.get(key) ?? new Set<string>();
    set.add(leg.trip_member_id);
    membersByFlightKey.set(key, set);
  }
  const addCandidatesFor = (leg: TravelLeg) => {
    const onThisFlight = membersByFlightKey.get(flightKey(leg)) ?? new Set();
    return nonDeclined
      .filter((m) => !onThisFlight.has(m.id))
      .map((m) => ({ id: m.id, name: resolveMemberName(memberNameMap, m.id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  // #477: split the manifest by direction. `legs` arrives sorted by
  // arrive_at ASC (nulls last), which is the right order for inbound;
  // outbound is re-sorted by depart_at.
  const inboundLegs = legs.filter((leg) => leg.direction === "inbound");
  // Sort outbound by depart_at ASC; legs with no depart_at sort LAST (a bare
  // "" sorts before any real time, which would float unknown-time departures
  // to the top). #579.
  const outboundLegs = [
    ...legs.filter((leg) => leg.direction === "outbound"),
  ].sort((a, b) => {
    if (!a.depart_at) return b.depart_at ? 1 : 0;
    if (!b.depart_at) return -1;
    return a.depart_at.localeCompare(b.depart_at);
  });

  const dayGroups = groupInboundByDay(inboundLegs, tripTimezone);
  const rideShareClusters = computeRideShareClusters(inboundLegs);

  const renderCard = (leg: TravelLeg) => (
    <TravelLegCard
      key={leg.id}
      leg={leg}
      myTripMemberId={myTripMemberId}
      ownerName={resolveMemberName(memberNameMap, leg.trip_member_id)}
      // #574: only set for an unconfirmed tag (written_by set & != owner).
      taggerName={
        leg.written_by_trip_member_id &&
        leg.written_by_trip_member_id !== leg.trip_member_id
          ? resolveMemberName(memberNameMap, leg.written_by_trip_member_id)
          : null
      }
      // #574 follow-up — who this viewer can still add to this flight.
      addCandidates={addCandidatesFor(leg)}
      tripTimezone={tripTimezone}
      // #452: without this, the per-card edit sheet's save/delete left
      // stale legs on screen until a manual reload.
      onMutated={handleMutated}
      // #525 — only the viewer's own card can open the edit sheet, so
      // the suggestion inputs are only meaningful there; forwarding to
      // every card is harmless (non-owners never mount the sheet).
      myDays={myDays}
      tripStartsAt={tripStartsAt}
      tripEndsAt={tripEndsAt}
    />
  );

  // #579 — compact read-only glance row. Pending co-traveler tags render as
  // normal rows here (no "unconfirmed" marker in the glance); confirm/dismiss
  // still lives on the Full card.
  const renderRow = (leg: TravelLeg) => (
    <TravelLegRow
      key={leg.id}
      leg={leg}
      ownerName={resolveMemberName(memberNameMap, leg.trip_member_id)}
      tripTimezone={tripTimezone}
    />
  );

  const isCompact = view === "compact";
  // Shared lowercase-mono day-header register (#211, #579) for both views.
  const dayHeaderClass = "text-muted-foreground font-mono text-xs lowercase";
  // The toggle only earns its place once there's something to reshape.
  const hasAnyLeg = inboundLegs.length > 0 || outboundLegs.length > 0;

  return (
    <div className="flex flex-col gap-6">
      {/* #579 — density switch; the single control (no per-row expand). */}
      {hasAnyLeg ? (
        <div className="flex justify-end">
          <ViewToggle value={view} onChange={handleViewChange} />
        </div>
      ) : null}

      {/* Inbound — "Who's landing when" is the page <h1> */}
      <div className="flex flex-col gap-4">
        {/* Ride-share nudge: one quiet static line per cluster (#477) */}
        {rideShareClusters.map((cluster, i) => (
          <p
            // Same airport can emit multiple time-window clusters — index disambiguates
            key={`${cluster.airport}-${i}`}
            className="text-muted-foreground text-sm"
          >
            {M3_UI_STRINGS.arrivals_ride_share_template
              .replace("{count}", String(cluster.count))
              .replace("{airport}", cluster.airport)}
          </p>
        ))}

        {inboundLegs.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {M3_UI_STRINGS.arrivals_empty}
          </p>
        ) : (
          dayGroups.map((group) => (
            <section key={group.key} className="flex flex-col gap-3">
              <h2 className={dayHeaderClass}>{group.label}</h2>
              {isCompact ? (
                <ul className="flex flex-col">{group.legs.map(renderRow)}</ul>
              ) : (
                group.legs.map(renderCard)
              )}
            </section>
          ))
        )}
      </div>

      {/* Outbound — quieter section, only when someone's logged a leg home */}
      {outboundLegs.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-sm font-medium">
            {M3_UI_STRINGS.arrivals_section_outbound_heading}
          </h2>
          {isCompact ? (
            <ul className="flex flex-col">{outboundLegs.map(renderRow)}</ul>
          ) : (
            outboundLegs.map(renderCard)
          )}
        </section>
      ) : null}

      {/* Add CTAs — always visible so any member can log their travel */}
      <TravelLegFormSheet
        tripId={tripId}
        tripTimezone={tripTimezone}
        onMutated={handleMutated}
        myDays={myDays}
        tripStartsAt={tripStartsAt}
        tripEndsAt={tripEndsAt}
        // #574 — co-travelers taggable onto a new shared flight.
        tagCandidates={tagCandidates}
      />
    </div>
  );
}
