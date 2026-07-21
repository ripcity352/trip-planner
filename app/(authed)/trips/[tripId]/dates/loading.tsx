/**
 * Route-level loading fallback for `/trips/[tripId]/dates`.
 *
 * Issue #466. The date poll renders as a list of candidate-date cards
 * with vote counts.
 */

import { SkeletonCardList, SkeletonPage } from "@/components/ui/skeleton-card";

export default function DatePollLoading() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <SkeletonPage headingWidth="w-36">
        <SkeletonCardList count={3} lines={2} lineWidths={["w-1/3", "w-1/4"]} />
      </SkeletonPage>
    </section>
  );
}
