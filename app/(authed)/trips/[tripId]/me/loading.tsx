/**
 * Route-level loading fallback for `/trips/[tripId]/me`.
 *
 * Issue #466. A single-viewer profile page (name, email, sign-out) —
 * two placeholder cards, not a list.
 */

import { SkeletonCard, SkeletonPage } from "@/components/ui/skeleton-card";

export default function MeLoading() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <SkeletonPage headingWidth="w-20">
        <div className="flex flex-col gap-3">
          <SkeletonCard showAvatar lines={2} lineWidths={["w-1/2", "w-2/3"]} />
          <SkeletonCard lines={3} lineWidths={["w-1/3", "w-2/3", "w-1/2"]} />
        </div>
      </SkeletonPage>
    </section>
  );
}
