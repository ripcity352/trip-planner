/**
 * Route-level loading fallback for `/trips/[tripId]/itinerary`.
 *
 * Issue #466. The real page groups items into day sections; this
 * skeleton mirrors that with a day-label bar above each placeholder
 * card group.
 */

import { SkeletonCard, SkeletonPage } from "@/components/ui/skeleton-card";
import { cn } from "@/lib/utils";

export default function ItineraryLoading() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <SkeletonPage headingWidth="w-32">
        <div className="flex flex-col gap-4">
          {[0, 1].map((day) => (
            <div key={day} className="flex flex-col gap-2">
              <div
                className={cn(
                  "motion-safe:animate-pulse h-4 w-24 rounded-xs bg-muted"
                )}
                aria-hidden="true"
              />
              <div className="flex flex-col gap-2">
                <SkeletonCard lines={2} lineWidths={["w-1/2", "w-1/3"]} />
                <SkeletonCard lines={2} lineWidths={["w-2/3", "w-1/4"]} />
              </div>
            </div>
          ))}
        </div>
      </SkeletonPage>
    </section>
  );
}
