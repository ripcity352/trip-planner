/**
 * Route-level loading fallback for `/trips` (trip list).
 *
 * Issue #466. The real page renders a `grid grid-cols-1 gap-3
 * sm:grid-cols-2` of trip cards — mirrored here.
 */

import { SkeletonCard, SkeletonPage } from "@/components/ui/skeleton-card";

export default function TripsLoading() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <SkeletonPage headingWidth="w-32">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SkeletonCard lines={2} lineWidths={["w-2/3", "w-1/2"]} />
          <SkeletonCard lines={2} lineWidths={["w-1/2", "w-1/3"]} />
          <SkeletonCard lines={2} lineWidths={["w-2/3", "w-1/2"]} />
          <SkeletonCard lines={2} lineWidths={["w-1/2", "w-1/3"]} />
        </div>
      </SkeletonPage>
    </section>
  );
}
