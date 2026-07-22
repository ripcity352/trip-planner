/**
 * `/trips/[tripId]/itinerary` — day-by-day itinerary timeline (#35).
 *
 * Server Component. Fetches all items via `getItineraryByTrip` then
 * groups them by `day`. The day sections are driven by the actual
 * item days — we do NOT auto-generate empty days for trips that have
 * no items on a given day (empty days add noise at 375px). If no items
 * exist, we show the empty-state string.
 *
 * Visibility:
 *   - RLS already filters `hide_from_celebrant` rows for the celebrant.
 *   - The Server Component passes `isCelebrant` down to ItemCard for
 *     the "Something planned" placeholder logic on items RLS does NOT
 *     hide (e.g. `organizers_only` rows the celebrant happens to be
 *     able to read, though in practice RLS would hide those too).
 *   - The organizer sees all items + the visibility badge on each.
 *
 * Organizer add-item: wired via `<AddItemFormSheet>` at the bottom of
 * the page — client shell that toggles the form in/out of view.
 */

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTripBySlug, getViewerMember, getCelebrantName, getTripMembers } from "@/lib/db/trips";
import { getItineraryByTrip, getMyItemRsvps, getLodgingAssignmentsByTrip, getItemFlagsForOrganizer } from "@/lib/db/itinerary";
import { getRsvpCountsForTrip } from "@/lib/db/rsvp";
import { M3_UI_STRINGS, EMPTY_STATES } from "@/lib/copy/empty-states";
import { DaySection } from "@/components/trip/itinerary/day-section";
import { AddItemFormSheet } from "./add-item-form-sheet";
import type { ItineraryItemRsvpStatus } from "@/lib/db/types";

type PageProps = {
  params: Promise<{ tripId: string }>;
};

export default async function ItineraryPage({ params }: PageProps) {
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

  const isOrganizer =
    viewer.role === "organizer" || viewer.role === "co_organizer";
  const isCelebrant = viewer.is_celebrant;

  // Fetch celebrant name only when needed (organizer visibility badge)
  const celebrantName = isOrganizer
    ? (await getCelebrantName(supabase, trip.id)) ?? undefined
    : undefined;

  // Fan out: items + my RSVPs + lodging assignments + trip members in parallel
  // #365: one flags fetch serves both roles — the SELECT policies stack
  // (organizers read all, owners read own), so organizers get the full
  // read surface and members get exactly their own flags for rehydration.
  // #394: rsvpCounts.going feeds the per-item cost per-head estimate —
  // one trip-level query shared by every card, not a per-item fetch.
  const [items, myRsvps, lodgingAssignmentsMap, tripMembers, allFlags, rsvpCounts] =
    await Promise.all([
      getItineraryByTrip(supabase, trip.id),
      getMyItemRsvps(supabase, trip.id, viewer.id),
      getLodgingAssignmentsByTrip(supabase, trip.id),
      getTripMembers(supabase, trip.id),
      getItemFlagsForOrganizer(supabase, trip.id),
      getRsvpCountsForTrip(supabase, trip.id),
    ]);

  // Group flags by item for DaySection → ItemCard threading
  const itemFlagsMap = new Map<string, typeof allFlags>();
  for (const flag of allFlags) {
    const bucket = itemFlagsMap.get(flag.item_id) ?? [];
    itemFlagsMap.set(flag.item_id, [...bucket, flag]);
  }

  // Build a quick-lookup map of itemId → my RSVP status
  const myRsvpMap: Record<string, ItineraryItemRsvpStatus> = {};
  for (const r of myRsvps) {
    myRsvpMap[r.item_id] = r.status;
  }

  // Group items by day, preserving sort order from the DB query
  const dayMap = new Map<string, typeof items>();
  for (const item of items) {
    const bucket = dayMap.get(item.day) ?? [];
    bucket.push(item);
    dayMap.set(item.day, bucket);
  }
  const days = Array.from(dayMap.keys()).sort();

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {M3_UI_STRINGS.itinerary_heading}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{trip.name}</p>
      </header>

      {days.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {EMPTY_STATES.itinerary}
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {days.map((day) => (
            <DaySection
              key={day}
              day={day}
              items={dayMap.get(day) ?? []}
              myRsvpMap={myRsvpMap}
              isOrganizer={isOrganizer}
              isCelebrant={isCelebrant}
              celebrantName={celebrantName}
              lodgingAssignmentsMap={lodgingAssignmentsMap}
              tripMembers={tripMembers}
              tripTimezone={trip.timezone}
              tripStartsAt={trip.starts_at}
              tripEndsAt={trip.ends_at}
              itemFlagsMap={itemFlagsMap}
              inCount={rsvpCounts.going}
            />
          ))}
        </div>
      )}

      {/* Organizer add-item CTA (client shell) */}
      {isOrganizer ? (
        <div className="mt-8">
          <AddItemFormSheet
            tripId={trip.id}
            tripTimezone={trip.timezone}
            tripStartsAt={trip.starts_at}
            tripEndsAt={trip.ends_at}
          />
        </div>
      ) : null}
    </section>
  );
}
