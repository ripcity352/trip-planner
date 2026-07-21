/**
 * Route-level loading fallback for `/trips/[tripId]/roster`.
 *
 * Issue #466. Roster rows render as an avatar + name/role line
 * (`RosterList`) — `showAvatar` mirrors that shape.
 */

import { SkeletonCardList, SkeletonPage } from "@/components/ui/skeleton-card";

export default function RosterLoading() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <SkeletonPage headingWidth="w-24">
        <SkeletonCardList
          count={4}
          showAvatar
          lines={2}
          lineWidths={["w-1/3", "w-1/4"]}
        />
      </SkeletonPage>
    </section>
  );
}
