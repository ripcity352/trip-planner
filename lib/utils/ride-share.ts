/**
 * Ride-share cluster computation for the arrivals manifest (#477 / #581).
 *
 * Pure function — when 2+ PEOPLE share the same (non-empty, free-text)
 * airport within 60 minutes, the manifest renders one quiet static line
 * ("3 of you land at LAX within an hour — split a ride?") AND, per #581,
 * seeds the "start a ride" form (airport + the clustered members'
 * `memberIds` pre-checked). Still NOT a matching engine: the cluster is a
 * suggestion; forming a ride is the persisted, opt-in step (lib/db/ride-groups).
 *
 * Both directions (#581): an INBOUND cluster is people landing together
 * (shared car FROM the airport, keyed on `arrive_at`); an OUTBOUND cluster
 * is people leaving together (shared car TO the airport, keyed on
 * `depart_at`). Airport matching is trim + case-insensitive on the free
 * text — "lax" and " LAX " group; "LAX" and "Los Angeles Intl" do not.
 */

import type { TravelLeg, TravelLegDirection } from "@/lib/db/types";

export interface RideShareCluster {
  /** Display airport — the trimmed text of the cluster's first leg. */
  airport: string;
  /** Number of distinct people (trip_member_id), not legs. */
  count: number;
  /**
   * #581 — the distinct clustered members, in first-appearance order. Feeds
   * the "start a ride" seed (pre-checked riders). Length always === count.
   */
  memberIds: string[];
}

const WINDOW_MS = 60 * 60 * 1000;

interface ClusterableLeg {
  tripMemberId: string;
  airportKey: string;
  airportDisplay: string;
  instantMs: number;
}

/**
 * Compute ride-share clusters from a trip's travel legs for one direction.
 *
 * Only legs matching `direction`, with a non-blank airport, a parseable
 * instant (arrive_at for inbound / depart_at for outbound), and no pending
 * #574 co-traveler tag (`written_by_trip_member_id is null`) participate.
 * Within each airport, legs are sorted by instant and greedily windowed: a
 * cluster is every leg within 60 minutes of the cluster's first. Clusters
 * with fewer than 2 distinct members are dropped (two connecting legs by one
 * person are not a ride share).
 */
export function computeRideShareClusters(
  legs: TravelLeg[],
  direction: TravelLegDirection = "inbound"
): RideShareCluster[] {
  const clusterable = legs.flatMap<ClusterableLeg>((leg) => {
    if (leg.direction !== direction) return [];
    // #574/#581: an unconfirmed co-traveler tag (written_by set) asserts
    // someone's flight before they've opted in — counting it inflates the
    // ride-share cluster (rule #8: recommend, don't assume). A self-logged
    // leg and a confirmed/adopted tag both carry NULL here. Mirrors
    // getArrivalTimesByTrip's `.is("written_by_trip_member_id", null)`.
    if (leg.written_by_trip_member_id !== null) return [];
    const airportDisplay = (leg.airport ?? "").trim();
    if (!airportDisplay) return [];
    // Inbound clusters on arrival; outbound clusters on departure.
    const instant = direction === "inbound" ? leg.arrive_at : leg.depart_at;
    if (!instant) return [];
    const instantMs = Date.parse(instant);
    if (Number.isNaN(instantMs)) return [];
    return [
      {
        tripMemberId: leg.trip_member_id,
        airportKey: airportDisplay.toUpperCase(),
        airportDisplay,
        instantMs,
      },
    ];
  });

  const byAirport = new Map<string, ClusterableLeg[]>();
  for (const leg of clusterable) {
    byAirport.set(leg.airportKey, [...(byAirport.get(leg.airportKey) ?? []), leg]);
  }

  const clusters: RideShareCluster[] = [];
  for (const group of byAirport.values()) {
    const sorted = [...group].sort((a, b) => a.instantMs - b.instantMs);
    let start = 0;
    while (start < sorted.length) {
      let end = start;
      while (
        end + 1 < sorted.length &&
        sorted[end + 1].instantMs - sorted[start].instantMs <= WINDOW_MS
      ) {
        end += 1;
      }
      const window = sorted.slice(start, end + 1);
      // Distinct members, preserving first-appearance (arrival) order.
      const memberIds: string[] = [];
      const seen = new Set<string>();
      for (const leg of window) {
        if (!seen.has(leg.tripMemberId)) {
          seen.add(leg.tripMemberId);
          memberIds.push(leg.tripMemberId);
        }
      }
      if (memberIds.length >= 2) {
        clusters.push({
          airport: window[0].airportDisplay,
          count: memberIds.length,
          memberIds,
        });
        start = end + 1;
      } else {
        start += 1;
      }
    }
  }

  return clusters;
}
