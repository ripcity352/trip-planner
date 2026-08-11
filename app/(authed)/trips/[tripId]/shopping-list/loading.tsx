/**
 * Route-level loading fallback for `/trips/[tripId]/shopping-list`.
 *
 * Mirrors the arrivals skeleton — a per-item row.
 */

import { SkeletonCardList, SkeletonPage } from "@/components/ui/skeleton-card";

export default function ShoppingListLoading() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <SkeletonPage headingWidth="w-32">
        <SkeletonCardList
          count={4}
          showAvatar
          lines={2}
          lineWidths={["w-1/3", "w-1/2"]}
        />
      </SkeletonPage>
    </section>
  );
}
