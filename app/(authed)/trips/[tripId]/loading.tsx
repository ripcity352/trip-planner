/**
 * Route-level loading fallback for `/trips/[tripId]` (dashboard).
 *
 * Issue #466: tab taps on slow networks gave zero loading feedback.
 * This Suspense fallback renders instantly while the page's parallel
 * data fetches (RSVP counts, itinerary, glance cards, ...) resolve.
 *
 * Mirrors the dashboard's card rhythm: an RSVP summary card + a handful
 * of link-card placeholders (Itinerary / Announcements / Arrivals /
 * Roster).
 */

import { SkeletonCard, SkeletonPage } from "@/components/ui/skeleton-card";

export default function TripDashboardLoading() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <SkeletonPage headingWidth="w-48">
        <div className="flex flex-col gap-3">
          <SkeletonCard lines={2} lineWidths={["w-1/2", "w-1/3"]} />
          <SkeletonCard lines={2} lineWidths={["w-2/3", "w-1/4"]} />
          <SkeletonCard lines={2} lineWidths={["w-1/2", "w-1/3"]} />
          <SkeletonCard lines={2} lineWidths={["w-2/3", "w-2/5"]} />
        </div>
      </SkeletonPage>
    </section>
  );
}
