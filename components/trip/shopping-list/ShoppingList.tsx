"use client";

/**
 * `<ShoppingList>` — client component rendered by
 * `/trips/[tripId]/shopping-list`.
 *
 * Builds the `memberMap` from `tripMembers` (matches the arrivals
 * manifest — the page hands down raw members, the client component
 * builds the lookup). Partitions items into active vs. bought
 * ("got it") and renders:
 *   1. the active list,
 *   2. a `gotItDivider` (no count — CLAUDE.md hard-bans completion
 *      scores) + struck bought items when any exist,
 *   3. the empty state (gap-D) only when there are ZERO items total —
 *      never when active is merely empty but bought items remain,
 *   4. `<AddItemSheet>`.
 *
 * P2-T5 — threads the folded per-item reaction summary + comment count
 * down to each `<ShoppingItemCard>` (never raw rows — the aggregate-only
 * boundary is enforced server-side in `page.tsx`, P2-T7). Both default to
 * empty so this component works standalone before P2-T7 wires the page.
 * Holds `openItemId` for the P2-T6 detail sheet — the sheet itself isn't
 * rendered yet (see the seam comment below).
 */

import * as React from "react";

import { EMPTY_STATES, SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";
import { resolveMemberName } from "@/lib/utils/member-display";
import { AddItemSheet } from "./AddItemSheet";
import { ShoppingItemCard } from "./ShoppingItemCard";
import type {
  ShoppingItem,
  ShoppingItemReactionSummary,
  TripMember,
} from "@/lib/db/types";
import type { ViewerMember } from "@/lib/db/trips";

export interface ShoppingListProps {
  items: ShoppingItem[];
  tripMembers: TripMember[];
  tripId: string;
  viewer: ViewerMember;
  /** Folded per-item reaction summary, keyed by item id. Never raw rows. */
  reactionsByItem?: Record<string, ShoppingItemReactionSummary>;
  /** Folded per-item note-thread count, keyed by item id. */
  commentCountByItem?: Record<string, number>;
}

const ORGANIZER_ROLES = new Set(["organizer", "co_organizer"]);

export function ShoppingList({
  items,
  tripMembers,
  tripId,
  viewer,
  reactionsByItem = {},
  commentCountByItem = {},
}: ShoppingListProps) {
  const memberMap = React.useMemo(
    () => new Map(tripMembers.map((member) => [member.id, member])),
    [tripMembers]
  );

  // P2-T6 seam: holds which item's detail sheet is open. Setter is passed
  // to every card as `onOpenItem`; no sheet renders yet.
  const [openItemId, setOpenItemId] = React.useState<string | null>(null);

  const celebrantName = React.useMemo(() => {
    const celebrant = tripMembers.find((member) => member.is_celebrant);
    return celebrant ? resolveMemberName(memberMap, celebrant.id) : null;
  }, [tripMembers, memberMap]);

  const isViewerOrganizer = ORGANIZER_ROLES.has(viewer.role);

  const active = items.filter((item) => !item.bought);
  const bought = items.filter((item) => item.bought);

  const canDelete = (item: ShoppingItem) =>
    isViewerOrganizer || item.created_by_trip_member_id === viewer.id;

  return (
    <div className="flex flex-col gap-6">
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {EMPTY_STATES.shopping_list_empty}
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          {active.length > 0 ? (
            <ul>
              {active.map((item) => (
                <ShoppingItemCard
                  key={item.id}
                  item={item}
                  memberMap={memberMap}
                  viewerMemberId={viewer.id}
                  canDelete={canDelete(item)}
                  claimReadOnly={false}
                  reactionSummary={reactionsByItem[item.id]}
                  commentCount={commentCountByItem[item.id] ?? 0}
                  onOpenItem={setOpenItemId}
                />
              ))}
            </ul>
          ) : null}

          {bought.length > 0 ? (
            <>
              {/* gotItDivider carries no count — a claimed/total fraction
                  is a disguised completion score (CLAUDE.md hard-ban). */}
              <p className="text-muted-foreground mt-4 mb-1 text-xs font-medium tracking-wide uppercase">
                {SHOPPING_LIST_UI_STRINGS.gotItDivider}
              </p>
              <ul>
                {bought.map((item) => (
                  <ShoppingItemCard
                    key={item.id}
                    item={item}
                    memberMap={memberMap}
                    viewerMemberId={viewer.id}
                    canDelete={canDelete(item)}
                    claimReadOnly
                    reactionSummary={reactionsByItem[item.id]}
                    commentCount={commentCountByItem[item.id] ?? 0}
                    onOpenItem={setOpenItemId}
                  />
                ))}
              </ul>
            </>
          ) : null}
        </div>
      )}

      <AddItemSheet tripId={tripId} viewer={viewer} celebrantName={celebrantName} />

      {/* P2-T6: render <ShoppingItemSheet itemId={openItemId} onClose={() => setOpenItemId(null)} .../>
          when openItemId is set. Left as a no-op seam for now — the hidden
          marker below keeps `openItemId` a real (test-observable) read
          instead of a write-only ref until the sheet lands. */}
      <span hidden data-open-item-id={openItemId ?? undefined} />
    </div>
  );
}
