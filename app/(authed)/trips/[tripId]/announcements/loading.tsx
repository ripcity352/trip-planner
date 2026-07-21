/**
 * Route-level loading fallback for `/trips/[tripId]/announcements`.
 *
 * Issue #466. Mirrors the feed rhythm: a composer-shaped card up top
 * (organizer-only in the real page, but shown as a placeholder either
 * way since we don't know the viewer's role during the loading state),
 * then a stack of announcement-card placeholders.
 */

import { SkeletonCard, SkeletonCardList, SkeletonPage } from "@/components/ui/skeleton-card";

export default function AnnouncementsLoading() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <SkeletonPage headingWidth="w-40">
        <div className="flex flex-col gap-4">
          <SkeletonCard lines={1} lineWidths={["w-full"]} className="py-4" />
          <SkeletonCardList
            count={3}
            showAvatar
            lines={2}
            lineWidths={["w-2/3", "w-1/3"]}
          />
        </div>
      </SkeletonPage>
    </section>
  );
}
