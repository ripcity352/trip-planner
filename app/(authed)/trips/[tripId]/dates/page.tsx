/**
 * `/trips/[tripId]/dates` — celebrant-weighted date poll (M2 Wave 3,
 * #75 + #76).
 *
 * The URL segment is the trip's `slug` (preserved naming convention
 * from `[tripId]/page.tsx`). RLS gates visibility; a non-member's
 * read returns null → notFound() so non-membership and non-existence
 * surface identically (no enumeration oracle).
 *
 * Server-side render computes:
 *   - the trip
 *   - the viewer's trip_members row (role + is_celebrant + id)
 *   - the initial view-model (candidates + marks + counts + my-vote)
 *
 * Then a client-side `<LiveRegion>` wraps `<PulsePoll>` to keep the
 * candidate list + counts in sync across browsers in real time.
 *
 * Voice: every string sources from `M2_UI_STRINGS` — see
 * `lib/copy/empty-states.ts`. Voice-tested at PR time per the design
 * system checklist.
 */

import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getTripBySlug } from "@/lib/db/trips";
import { getDatePollViewModel } from "@/lib/db/date-poll";
import { M2_UI_STRINGS } from "@/lib/copy/empty-states";
import type { TripRole } from "@/lib/db/types";

import { LiveRegion } from "./_live-region";

type PageProps = {
  params: Promise<{ tripId: string }>;
};

export default async function DatePollPage({ params }: PageProps) {
  const { tripId: slug } = await params;
  const supabase = await createClient();

  const trip = await getTripBySlug(supabase, slug);
  if (!trip) {
    notFound();
  }

  // Resolve the caller. The (authed) layout guarantees presence but
  // we double-check so a misconfigured layout can't leak.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    notFound();
  }

  // Look up the viewer's trip_member row — RLS lets a member read
  // their own row directly.
  const { data: memberRow, error: memberError } = await supabase
    .from("trip_members")
    .select("id, role, is_celebrant")
    .eq("trip_id", trip.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (memberError || !memberRow) {
    notFound();
  }
  const viewer = memberRow as {
    id: string;
    role: TripRole;
    is_celebrant: boolean;
  };
  const isCelebrant = viewer.is_celebrant;
  const isOrganizer =
    viewer.role === "organizer" || viewer.role === "co_organizer";

  const initialRows = await getDatePollViewModel(
    supabase,
    trip.id,
    viewer.id
  );

  const subhead = isCelebrant
    ? M2_UI_STRINGS.datePoll_celebrant_subhead
    : M2_UI_STRINGS.datePoll_member_subhead;

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {M2_UI_STRINGS.datePoll_heading}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{subhead}</p>
      </header>
      <LiveRegion
        tripId={trip.id}
        isCelebrant={isCelebrant}
        isOrganizer={isOrganizer}
        viewerTripMemberId={viewer.id}
        initialRows={initialRows}
      />
    </section>
  );
}
