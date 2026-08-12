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
 *
 * P2-T6 — holds `openItemId`; when set, renders `<ShoppingItemSheet>` for
 * that item, sourced from `commentsByItem` (full comment rows for the
 * detail thread, distinct from `commentCountByItem`'s row-level fold) +
 * `reactionsByItem` + `now`. `now` defaults to `new Date()` evaluated at
 * render if the page (P2-T7) doesn't supply one — components work
 * standalone pre-wiring, same as the reaction/comment-count defaults above.
 */

import * as React from "react";

import { EMPTY_STATES, SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";
import { resolveMemberName } from "@/lib/utils/member-display";
import { AddItemSheet } from "./AddItemSheet";
import { ShoppingItemCard } from "./ShoppingItemCard";
import { ShoppingItemSheet } from "./ShoppingItemSheet";
import type {
  ShoppingItem,
  ShoppingItemComment,
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
  /** Full comment rows for the detail sheet's Notes thread, keyed by item id. */
  commentsByItem?: Record<string, ShoppingItemComment[]>;
  /** Server reference clock for the detail sheet's relative-time labels. */
  now?: Date;
}

const ORGANIZER_ROLES = new Set(["organizer", "co_organizer"]);

export function ShoppingList({
  items,
  tripMembers,
  tripId,
  viewer,
  reactionsByItem = {},
  commentCountByItem = {},
  commentsByItem = {},
  now,
}: ShoppingListProps) {
  const memberMap = React.useMemo(
    () => new Map(tripMembers.map((member) => [member.id, member])),
    [tripMembers]
  );

  // Holds which item's detail sheet is open. Setter is passed to every
  // card as `onOpenItem`.
  const [openItemId, setOpenItemId] = React.useState<string | null>(null);
  const openItem = openItemId
    ? (items.find((item) => item.id === openItemId) ?? null)
    : null;

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

      {openItem ? (
        <ShoppingItemSheet
          item={openItem}
          reactionSummary={reactionsByItem[openItem.id]}
          comments={commentsByItem[openItem.id] ?? []}
          memberMap={memberMap}
          viewer={viewer}
          now={now ?? new Date()}
          onClose={() => setOpenItemId(null)}
        />
      ) : null}

      {/* Test-observable read of `openItemId` — kept alongside the real
          sheet render above (harmless when the sheet is also mounted). */}
      <span hidden data-open-item-id={openItemId ?? undefined} />
    </div>
  );
}
