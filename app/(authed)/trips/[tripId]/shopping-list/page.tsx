/**
 * `/trips/[tripId]/shopping-list` — shopping-list page (standalone,
 * zero expenses coupling — see notes/shopping-list-exploration.md).
 *
 * Server Component. Mirrors the arrivals page shape: resolve the trip
 * by slug, resolve the viewer's `trip_member_id`, fetch items + all
 * trip members in parallel, hand off to `<ShoppingList>`.
 *
 * P2-T7 — wires the social layer (spec §12.2/§12.4, cloned from
 * `announcements/page.tsx:64-79`): reactions + comments are fetched
 * alongside items/members in the same `Promise.all` fan-out, then folded
 * SERVER-SIDE before anything reaches the client component tree.
 * `summarizeItemReactions` drops `trip_member_id` — the client only ever
 * receives `{ counts, mine }` per item (the aggregate-only boundary,
 * §12.2 load-bearing). Comments are enriched via a memberMap keyed by
 * `trip_members.id` (NOT `user_id` — `author_trip_member_id` FKs
 * `trip_members(id)` directly, unlike `announcements.created_by` which
 * FKs `auth.users`), then grouped by `item_id` for the detail sheet, with
 * per-item counts derived from that same grouping (no extra query).
 *
 * Access: any authenticated trip member. Non-members → 404 (RLS
 * returns empty on trip lookup; `notFound()` fires).
 */

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getTripBySlug, getViewerMember, getTripMembers } from "@/lib/db/trips";
import { getShoppingItems } from "@/lib/db/shopping-list";
import {
  getShoppingReactionsForTrip,
  summarizeItemReactions,
} from "@/lib/db/shopping-item-reactions";
import {
  enrichComments,
  getCommentsForTrip,
} from "@/lib/db/shopping-item-comments";
import { SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";
import { ShoppingList } from "@/components/trip/shopping-list/ShoppingList";
import type { ShoppingItemComment } from "@/lib/db/types";

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

  const [items, tripMembers, reactions, comments] = await Promise.all([
    getShoppingItems(supabase, trip.id),
    getTripMembers(supabase, trip.id),
    getShoppingReactionsForTrip(supabase, trip.id),
    getCommentsForTrip(supabase, trip.id),
  ]);

  // The caller's own seat — drives the "mine" highlight on reaction
  // pills. null only if the membership row is somehow missing (viewer
  // resolved above via getViewerMember, so this should always hit).
  const myMemberId = tripMembers.find((m) => m.user_id === user.id)?.id ?? null;

  // Server-side fold — the ONLY place raw reaction rows exist. The
  // client receives just { counts, mine } per item (§12.2 boundary).
  const reactionsByItem = summarizeItemReactions(reactions, myMemberId);

  // enrichComments expects a memberMap keyed by trip_members.id (the
  // author_trip_member_id FK target) — NOT user_id, per the contract in
  // lib/db/shopping-item-comments.ts.
  const memberMapById = new Map<string, string | null>(
    tripMembers.map((m) => [m.id, m.display_name])
  );
  const enrichedComments = enrichComments(comments, memberMapById);

  const commentsByItem = enrichedComments.reduce<
    Record<string, ShoppingItemComment[]>
  >((acc, comment) => {
    const existing = acc[comment.item_id] ?? [];
    return { ...acc, [comment.item_id]: [...existing, comment] };
  }, {});

  const commentCountByItem = Object.fromEntries(
    Object.entries(commentsByItem).map(([itemId, list]) => [itemId, list.length])
  );

  const now = new Date();

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
        reactionsByItem={reactionsByItem}
        commentCountByItem={commentCountByItem}
        commentsByItem={commentsByItem}
        now={now}
      />
    </section>
  );
}
