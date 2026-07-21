/**
 * Ride-share label computation for the arrivals manifest (#477).
 *
 * Pure function — when 2+ PEOPLE land at the same (non-empty, free-text)
 * airport within 60 minutes, the manifest renders one quiet static line
 * ("3 of you land at LAX within an hour — split a ride?").
 *
 * Deliberately NOT a matching engine: no persistence, no member names, no
 * opt-in state (#118 carpool coordination stays open). Airport matching is
 * trim + case-insensitive on the free text — "lax" and " LAX " group;
 * "LAX" and "Los Angeles Intl" do not. That's the accepted precision of a
 * free-text field (scope fence: no structured origin / airport validation).
 */

import type { TravelLeg } from "@/lib/db/types";

export interface RideShareCluster {
  /** Display airport — the trimmed text of the cluster's first leg. */
  airport: string;
  /** Number of distinct people (trip_member_id), not legs. */
  count: number;
}

const WINDOW_MS = 60 * 60 * 1000;

interface ClusterableLeg {
  tripMemberId: string;
  airportKey: string;
  airportDisplay: string;
  arriveMs: number;
}

/**
 * Compute ride-share clusters from a trip's travel legs.
 *
 * Only inbound legs with a non-blank airport and a parseable arrive_at
 * participate. Within each airport, legs are sorted by arrival and greedily
 * windowed: a cluster is every leg arriving within 60 minutes of the
 * cluster's first leg. Clusters with fewer than 2 distinct members are
 * dropped (two connecting legs by one person are not a ride share).
 */
export function computeRideShareClusters(
  legs: TravelLeg[]
): RideShareCluster[] {
  const clusterable = legs.flatMap<ClusterableLeg>((leg) => {
    if (leg.direction !== "inbound") return [];
    const airportDisplay = (leg.airport ?? "").trim();
    if (!airportDisplay || !leg.arrive_at) return [];
    const arriveMs = Date.parse(leg.arrive_at);
    if (Number.isNaN(arriveMs)) return [];
    return [
      {
        tripMemberId: leg.trip_member_id,
        airportKey: airportDisplay.toUpperCase(),
        airportDisplay,
        arriveMs,
      },
    ];
  });

  const byAirport = new Map<string, ClusterableLeg[]>();
  for (const leg of clusterable) {
    byAirport.set(leg.airportKey, [...(byAirport.get(leg.airportKey) ?? []), leg]);
  }

  const clusters: RideShareCluster[] = [];
  for (const group of byAirport.values()) {
    const sorted = [...group].sort((a, b) => a.arriveMs - b.arriveMs);
    let start = 0;
    while (start < sorted.length) {
      let end = start;
      while (
        end + 1 < sorted.length &&
        sorted[end + 1].arriveMs - sorted[start].arriveMs <= WINDOW_MS
      ) {
        end += 1;
      }
      const window = sorted.slice(start, end + 1);
      const people = new Set(window.map((leg) => leg.tripMemberId));
      if (people.size >= 2) {
        clusters.push({
          airport: window[0].airportDisplay,
          count: people.size,
        });
        start = end + 1;
      } else {
        start += 1;
      }
    }
  }

  return clusters;
}
