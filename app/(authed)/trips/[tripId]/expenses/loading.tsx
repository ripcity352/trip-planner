/**
 * Route-level loading fallback for `/trips/[tripId]/expenses`.
 *
 * Issue #466. The real page renders an `<ol className="flex flex-col
 * gap-3">` of expense cards — `SkeletonCardList` matches that rhythm
 * exactly.
 */

import { SkeletonCardList, SkeletonPage } from "@/components/ui/skeleton-card";

export default function ExpensesLoading() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <SkeletonPage headingWidth="w-32">
        <SkeletonCardList count={4} lines={2} lineWidths={["w-1/2", "w-1/4"]} />
      </SkeletonPage>
    </section>
  );
}
