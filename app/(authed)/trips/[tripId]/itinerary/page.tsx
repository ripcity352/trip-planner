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
import { getTripBySlug } from "@/lib/db/trips";
import { getItineraryByTrip, getMyItemRsvps } from "@/lib/db/itinerary";
import { M3_UI_STRINGS, EMPTY_STATES } from "@/lib/copy/empty-states";
import { DaySection } from "@/components/trip/itinerary/day-section";
import { AddItemFormSheet } from "./add-item-form-sheet";
import type { TripRole, ItineraryItemRsvpStatus } from "@/lib/db/types";

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

  // Viewer's member row — role + is_celebrant
  const { data: memberRow } = await supabase
    .from("trip_members")
    .select("id, role, is_celebrant, display_name")
    .eq("trip_id", trip.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!memberRow) {
    notFound();
  }

  const viewer = memberRow as {
    id: string;
    role: TripRole;
    is_celebrant: boolean;
    display_name: string | null;
  };
  const isOrganizer =
    viewer.role === "organizer" || viewer.role === "co_organizer";
  const isCelebrant = viewer.is_celebrant;

  // Fetch celebrant name for the visibility badge (organizer view)
  let celebrantName: string | undefined;
  if (isOrganizer) {
    const { data: celebrantRow } = await supabase
      .from("trip_members")
      .select("display_name")
      .eq("trip_id", trip.id)
      .eq("is_celebrant", true)
      .maybeSingle();
    celebrantName = (celebrantRow as { display_name: string | null } | null)
      ?.display_name ?? undefined;
  }

  // Fan out: items + my RSVPs in parallel
  const [items, myRsvps] = await Promise.all([
    getItineraryByTrip(supabase, trip.id),
    getMyItemRsvps(supabase, trip.id),
  ]);

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
            />
          ))}
        </div>
      )}

      {/* Organizer add-item CTA (client shell) */}
      {isOrganizer ? (
        <div className="mt-8">
          <AddItemFormSheet tripId={trip.id} />
        </div>
      ) : null}
    </section>
  );
}
