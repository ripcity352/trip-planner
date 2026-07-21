/**
 * Route-level loading fallback for `/trips/[tripId]/arrivals`.
 *
 * Issue #466. Mirrors the arrivals manifest — a per-member row with a
 * flight/time line.
 */

import { SkeletonCardList, SkeletonPage } from "@/components/ui/skeleton-card";

export default function ArrivalsLoading() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <SkeletonPage headingWidth="w-28">
        <SkeletonCardList
          count={3}
          showAvatar
          lines={2}
          lineWidths={["w-1/3", "w-1/2"]}
        />
      </SkeletonPage>
    </section>
  );
}
