/**
 * `/trips/[tripId]/roster` — member list with contact-export actions (#39, #40).
 *
 * Server Component. Fetches trip + members via the `lib/db/` layer.
 * The two interactive actions (vCard download, copy-all-numbers) live in
 * client sub-components inside `components/trip/roster/`.
 *
 * Access: any authenticated trip member can view the roster.
 * RLS guarantees non-members see nothing (notFound fallthrough).
 */

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTripBySlug, getViewerMember, getTripMembers } from "@/lib/db/trips";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { RosterList } from "@/components/trip/roster/roster-list";
import { DayHeadcount } from "@/components/trip/day-headcount";
import type { RosterMember } from "@/components/trip/roster/roster-list";

type PageProps = {
  params: Promise<{ tripId: string }>;
};

export default async function RosterPage({ params }: PageProps) {
  const { tripId: slug } = await params;
  const supabase = await createClient();

  const trip = await getTripBySlug(supabase, slug);
  if (!trip) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    notFound();
  }

  const viewer = await getViewerMember(supabase, trip.id, user.id);
  if (!viewer) {
    notFound();
  }

  // Fan out: members list (parallel-safe, only one query here but consistent
  // with itinerary page pattern — easy to extend later)
  const rawMembers = await getTripMembers(supabase, trip.id);

  // Map to the RosterMember shape the component expects. isViewer flags the
  // signed-in user's own row so RosterList can render "You" instead of the
  // "Guest" fallback (#F5-partial — full identity-capture fix is #348).
  const members: RosterMember[] = rawMembers.map((m) => ({
    id: m.id,
    displayName: m.display_name,
    phone: m.phone_e164,
    role: m.role,
    isCelebrant: m.is_celebrant,
    isViewer: m.id === viewer.id,
  }));

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {M3_UI_STRINGS.roster_pageTitle}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{trip.name}</p>
      </header>

      {/* #388 — organizer-only per-day headcount (self-contained; single mount) */}
      <DayHeadcount
        tripId={trip.id}
        viewerRole={viewer.role}
        startsAt={trip.starts_at}
        endsAt={trip.ends_at}
      />

      <RosterList
        members={members}
        tripName={trip.name}
        tripSlug={slug}
        viewerRole={viewer.role}
      />
    </section>
  );
}
