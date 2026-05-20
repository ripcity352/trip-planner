/**
 * `/trips/[tripId]/invites` — organizer-facing invite-issuance page (#129).
 *
 * Server Component. Guards organizer-only access via the
 * `is_trip_organizer` RPC — non-organizers get `notFound()` which does NOT
 * leak the existence of the surface (identical 404 for "doesn't exist" and
 * "not your surface"). RLS on the `invites` table is defense-in-depth.
 *
 * Fetches existing active invites via `getInvitesByTrip` then renders:
 *   - A heading
 *   - InviteList (server) — existing links with copy + revoke affordances
 *   - CreateInviteForm (client) — mint new links
 */

import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getTripBySlug } from "@/lib/db/trips";
import { getInvitesByTrip } from "@/lib/db/invites";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { InviteList } from "@/components/trip/invites/invite-list";
import { InvitePageClient } from "./invite-page-client";

type PageProps = {
  params: Promise<{ tripId: string }>;
};

export const metadata = {
  title: M3_UI_STRINGS.invitesPage_pageTitle,
};

export default async function InvitesPage({ params }: PageProps) {
  const { tripId: slug } = await params;
  const supabase = await createClient();

  const trip = await getTripBySlug(supabase, slug);
  if (!trip) {
    notFound();
  }

  // Organizer-only gate: non-organizers see a 404 so the surface is invisible.
  // Defense-in-depth: RLS on `invites` also restricts SELECT/INSERT/UPDATE/DELETE
  // to organizers — the page-level check is the first gate.
  const { data: isOrganizer } = await supabase.rpc("is_trip_organizer", {
    p_trip_id: trip.id,
  });
  if (!isOrganizer) {
    notFound();
  }

  const invites = await getInvitesByTrip(supabase, trip.id);

  return (
    <main className="max-w-lg mx-auto px-4 py-8 flex flex-col gap-6">
      <h1 className="text-xl font-semibold">
        {M3_UI_STRINGS.invitesPage_heading}
      </h1>

      <InviteList invites={invites} />

      {/* Client shell: holds the create-form toggle + refreshes the list
          after a successful mint by triggering a full page router refresh. */}
      <InvitePageClient tripId={trip.id} />
    </main>
  );
}
