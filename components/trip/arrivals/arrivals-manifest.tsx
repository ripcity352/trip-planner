"use client";

/**
 * ArrivalsManifest — client component that renders the two travel sections
 * (#477), the ride-share nudges + persisted ride groups (#581), and the add
 * CTAs.
 *
 * Inbound ("Who's landing when" — the page <h1>): legs grouped by trip-local
 * landing day, a quiet computed ride-share nudge when 2+ people land at the
 * same airport within an hour, and any formed ride groups. Outbound: a
 * quieter "Heading home" section with the same treatment (rides TO the
 * airport).
 *
 * Ride groups (#581): the nudge stays a quiet line but becomes actionable
 * ("start a ride") and suppresses once a ride covers that airport; a
 * persistent quiet "start a ride" affordance sits in each section so a manual
 * ride (no cluster) always has an entry point.
 *
 * "use client" because it needs router.refresh() after a successful mutation.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { resolveMemberName } from "@/lib/utils/member-display";
import { computeRideShareClusters } from "@/lib/utils/ride-share";
import { formatTripDayHeader } from "@/lib/utils/format-trip-tz";
import { TravelLegCard } from "./travel-leg-card";
import { TravelLegRow } from "./travel-leg-row";
import { RideGroupCard } from "./ride-group-card";
import { RideGroupRow } from "./ride-group-row";
import { RideNudgeLine } from "./ride-nudge-line";
import { StartRideSheet } from "./start-ride-sheet";
import { ViewToggle, type ArrivalsView } from "./view-toggle";
import { TravelLegFormSheet } from "./travel-leg-form-sheet";
import type { MemberDay } from "@/lib/db/trip-member-days";
import type {
  RideGroupWithRiders,
  TravelLeg,
  TravelLegDirection,
  TripMember,
} from "@/lib/db/types";

const ARRIVALS_VIEW_STORAGE_KEY = "pt:arrivalsView";

export interface ArrivalsManifestProps {
  tripId: string;
  legs: TravelLeg[];
  myTripMemberId: string;
  tripMembers: TripMember[];
  tripTimezone: string;
  myDays: MemberDay[];
  tripStartsAt: string | null;
  tripEndsAt: string | null;
  /** #581 — formed ride groups for this trip (both directions). Defaults to
   *  none (a manifest with no rides is a valid state). */
  rideGroups?: RideGroupWithRiders[];
  /** #581 — viewer may clear any ride (creator OR organizer). */
  viewerIsOrganizer?: boolean;
}

interface DayGroup {
  key: string;
  label: string;
  legs: TravelLeg[];
}

/** The open "start a ride" sheet's seed state, or null when closed. */
interface RideSheetState {
  direction: TravelLegDirection;
  seedAirport?: string;
  seedMemberIds: string[];
}

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
  rideGroups = [],
  viewerIsOrganizer = false,
}: ArrivalsManifestProps) {
  const router = useRouter();

  const [view, setView] = useState<ArrivalsView>("compact");
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(ARRIVALS_VIEW_STORAGE_KEY);
      if (stored === "full" || stored === "compact") {
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

  // #581 — the open "start a ride" sheet (seeded from a nudge, or blank from
  // the manual affordance). One sheet at a time.
  const [rideSheet, setRideSheet] = useState<RideSheetState | null>(null);

  const handleMutated = () => {
    router.refresh();
  };
  const handleRideCreated = () => {
    setRideSheet(null);
    router.refresh();
  };

  const memberNameMap = new Map(tripMembers.map((m) => [m.id, m]));

  const tagCandidates = tripMembers
    .filter((m) => m.id !== myTripMemberId && m.rsvp_status !== "declined")
    .map((m) => ({ id: m.id, name: resolveMemberName(memberNameMap, m.id) }));

  const nonDeclined = tripMembers.filter(
    (m) => m.rsvp_status !== "declined" && m.id !== myTripMemberId
  );

  // #581 — riders selectable in the "start a ride" sheet: every non-declined
  // member INCLUDING the viewer (shown as "You"), so a member can put
  // themselves in the ride. Names never surface an id/email.
  const riderOptions = tripMembers
    .filter((m) => m.rsvp_status !== "declined")
    .map((m) => ({
      id: m.id,
      name:
        m.id === myTripMemberId
          ? M3_UI_STRINGS.rideGroup_self_label
          : resolveMemberName(memberNameMap, m.id),
    }));

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

  const inboundLegs = legs.filter((leg) => leg.direction === "inbound");
  const outboundLegs = [
    ...legs.filter((leg) => leg.direction === "outbound"),
  ].sort((a, b) => {
    if (!a.depart_at) return b.depart_at ? 1 : 0;
    if (!b.depart_at) return -1;
    return a.depart_at.localeCompare(b.depart_at);
  });

  const dayGroups = groupInboundByDay(inboundLegs, tripTimezone);

  // #581 — rides + clusters split by direction. A cluster's nudge is
  // suppressed once a ride at that airport exists in the same direction.
  const inboundRides = rideGroups.filter((r) => r.direction === "inbound");
  const outboundRides = rideGroups.filter((r) => r.direction === "outbound");
  const rideAirportKeys = (rides: RideGroupWithRiders[]) =>
    new Set(rides.map((r) => (r.airport ?? "").trim().toUpperCase()).filter(Boolean));
  const inboundRideAirports = rideAirportKeys(inboundRides);
  const outboundRideAirports = rideAirportKeys(outboundRides);
  const inboundClusters = computeRideShareClusters(inboundLegs, "inbound").filter(
    (c) => !inboundRideAirports.has(c.airport.trim().toUpperCase())
  );
  const outboundClusters = computeRideShareClusters(outboundLegs, "outbound").filter(
    (c) => !outboundRideAirports.has(c.airport.trim().toUpperCase())
  );

  // Members already on a ride can't be added again to it.
  const addCandidatesForRide = (ride: RideGroupWithRiders) => {
    const onRide = new Set(ride.riders.map((r) => r.trip_member_id));
    return nonDeclined
      .filter((m) => !onRide.has(m.id))
      .map((m) => ({ id: m.id, name: resolveMemberName(memberNameMap, m.id) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  };

  const renderCard = (leg: TravelLeg) => (
    <TravelLegCard
      key={leg.id}
      leg={leg}
      myTripMemberId={myTripMemberId}
      ownerName={resolveMemberName(memberNameMap, leg.trip_member_id)}
      taggerName={
        leg.written_by_trip_member_id &&
        leg.written_by_trip_member_id !== leg.trip_member_id
          ? resolveMemberName(memberNameMap, leg.written_by_trip_member_id)
          : null
      }
      addCandidates={addCandidatesFor(leg)}
      tripTimezone={tripTimezone}
      onMutated={handleMutated}
      myDays={myDays}
      tripStartsAt={tripStartsAt}
      tripEndsAt={tripEndsAt}
    />
  );

  const renderRow = (leg: TravelLeg) => (
    <TravelLegRow
      key={leg.id}
      leg={leg}
      ownerName={resolveMemberName(memberNameMap, leg.trip_member_id)}
      tripTimezone={tripTimezone}
    />
  );

  const isCompact = view === "compact";
  const dayHeaderClass = "text-muted-foreground font-mono text-xs lowercase";
  // The density toggle earns its place once there's anything to reshape — legs
  // OR rides (a ride can exist with no logged legs, #581).
  const hasAnyContent =
    inboundLegs.length > 0 ||
    outboundLegs.length > 0 ||
    rideGroups.length > 0;

  // #581 — a ride rendered per view density.
  const renderRide = (ride: RideGroupWithRiders) =>
    isCompact ? (
      <RideGroupRow
        key={ride.id}
        ride={ride}
        myTripMemberId={myTripMemberId}
        memberNameMap={memberNameMap}
      />
    ) : (
      <RideGroupCard
        key={ride.id}
        ride={ride}
        myTripMemberId={myTripMemberId}
        memberNameMap={memberNameMap}
        addCandidates={addCandidatesForRide(ride)}
        canRemove={
          ride.created_by_trip_member_id === myTripMemberId || viewerIsOrganizer
        }
        onMutated={handleMutated}
      />
    );

  // #581 — the quiet "start a ride" affordances (nudge CTA + manual link).
  const openSeeded = (
    direction: TravelLegDirection,
    airport: string,
    memberIds: string[]
  ) => setRideSheet({ direction, seedAirport: airport, seedMemberIds: memberIds });
  const openManual = (direction: TravelLegDirection) =>
    setRideSheet({ direction, seedMemberIds: [myTripMemberId] });

  const startCtaClass =
    "text-muted-foreground hover:text-foreground self-start text-xs font-medium focus-visible:ring-ring rounded-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none";

  // Formed rides for a section, in the current density (compact list / full
  // cards). Shared by both direction sections.
  const ridesBlock = (rides: RideGroupWithRiders[]) =>
    rides.length === 0 ? null : isCompact ? (
      <ul className="flex flex-col">{rides.map(renderRide)}</ul>
    ) : (
      <div className="flex flex-col gap-3">{rides.map(renderRide)}</div>
    );

  const rideSheetFor = (direction: TravelLegDirection) =>
    rideSheet && rideSheet.direction === direction ? (
      <StartRideSheet
        tripId={tripId}
        direction={direction}
        seedAirport={rideSheet.seedAirport}
        seedMemberIds={rideSheet.seedMemberIds}
        riderOptions={riderOptions}
        onCreated={handleRideCreated}
        onCancel={() => setRideSheet(null)}
      />
    ) : null;

  const manualStartAffordance = (direction: TravelLegDirection) =>
    rideSheet && rideSheet.direction === direction ? null : (
      <button type="button" onClick={() => openManual(direction)} className={startCtaClass}>
        {direction === "outbound"
          ? M3_UI_STRINGS.rideGroup_manualCta_outbound
          : M3_UI_STRINGS.rideGroup_manualCta_inbound}
      </button>
    );

  return (
    <div className="flex flex-col gap-6">
      {hasAnyContent ? (
        <div className="flex justify-end">
          <ViewToggle value={view} onChange={handleViewChange} />
        </div>
      ) : null}

      {/* Inbound — "Who's landing when" is the page <h1> */}
      <div className="flex flex-col gap-4">
        {/* Ride-share nudges: one quiet actionable line per (uncovered) cluster */}
        {inboundClusters.map((cluster, i) => (
          <RideNudgeLine
            key={`${cluster.airport}-${i}`}
            cluster={cluster}
            direction="inbound"
            onStart={(airport, memberIds) =>
              openSeeded("inbound", airport, memberIds)
            }
          />
        ))}

        {rideSheetFor("inbound")}

        {/* Formed inbound rides */}
        {ridesBlock(inboundRides)}

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

        {/* Manual "start a ride" — always an entry point (rule #8) */}
        {manualStartAffordance("inbound")}
      </div>

      {/* Outbound — quieter section, only when someone's logged a leg home */}
      {outboundLegs.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-sm font-medium">
            {M3_UI_STRINGS.arrivals_section_outbound_heading}
          </h2>

          {outboundClusters.map((cluster, i) => (
            <RideNudgeLine
              key={`out-${cluster.airport}-${i}`}
              cluster={cluster}
              direction="outbound"
              onStart={(airport, memberIds) =>
                openSeeded("outbound", airport, memberIds)
              }
            />
          ))}

          {rideSheetFor("outbound")}

          {ridesBlock(outboundRides)}

          {isCompact ? (
            <ul className="flex flex-col">{outboundLegs.map(renderRow)}</ul>
          ) : (
            outboundLegs.map(renderCard)
          )}

          {manualStartAffordance("outbound")}
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
        tagCandidates={tagCandidates}
      />
    </div>
  );
}
