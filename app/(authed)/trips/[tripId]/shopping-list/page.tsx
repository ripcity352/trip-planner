/**
 * `/trips/[tripId]/shopping-list` — shopping-list page (standalone,
 * zero expenses coupling — see notes/shopping-list-exploration.md).
 *
 * Server Component. Mirrors the arrivals page shape: resolve the trip
 * by slug, resolve the viewer's `trip_member_id`, fetch items + all
 * trip members in parallel, hand off to `<ShoppingList>`.
 *
 * Access: any authenticated trip member. Non-members → 404 (RLS
 * returns empty on trip lookup; `notFound()` fires).
 */

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTripBySlug, getViewerMember, getTripMembers } from "@/lib/db/trips";
import { getShoppingItems } from "@/lib/db/shopping-list";
import { SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";
import { ShoppingList } from "@/components/trip/shopping-list/ShoppingList";

type PageProps = {
  params: Promise<{ tripId: string }>;
};

export default async function ShoppingListPage({ params }: PageProps) {
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

  const [items, tripMembers] = await Promise.all([
    getShoppingItems(supabase, trip.id),
    getTripMembers(supabase, trip.id),
  ]);

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {SHOPPING_LIST_UI_STRINGS.heading}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{trip.name}</p>
      </header>

      <ShoppingList
        items={items}
        tripMembers={tripMembers}
        tripId={trip.id}
        viewer={viewer}
      />
    </section>
  );
}
