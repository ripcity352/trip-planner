"use client";

/**
 * `<ShoppingList>` — client component rendered by
 * `/trips/[tripId]/shopping-list`.
 *
 * Builds the `memberMap` from `tripMembers` (matches the arrivals
 * manifest — the page hands down raw members, the client component
 * builds the lookup).
 *
 * v2 lifecycle rewrite (Task 6, spec §4/§5): groups `items` by
 * `deriveShoppingItemState` (open / in_progress / completed / removed)
 * and renders a segmented filter — All / Open / In-progress / Completed /
 * Removed — over the already-loaded items (client-side segment, no
 * refetch). All other segments are already fetched, so filtering removed
 * items in is intentional, not a leak.
 *
 *   - `All` (default) renders the sectioned view: active items (open +
 *     in_progress) flat on top, then a collapsible Completed section, then
 *     a collapsible Removed section — each behind its own divider/toggle.
 *   - Every other segment renders a flat list of just that state's cards.
 *
 * The empty state (gap-D) renders only when there are ZERO items total —
 * never when a filtered segment is merely empty (that gets a small
 * neutral line instead, `filterTab_emptyNote`).
 *
 * No completion score / fraction / progress bar anywhere (CLAUDE.md hard-
 * ban) — filter-tab counts, if shown, are plain per-tab navigational
 * counts, never a claimed/total ratio.
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

import { cn } from "@/lib/utils";
import {
  A11Y_UI_STRINGS,
  EMPTY_STATES,
  SHOPPING_LIST_UI_STRINGS,
} from "@/lib/copy/empty-states";
import { deriveShoppingItemState } from "@/lib/db/shopping-list";
import { resolveMemberName } from "@/lib/utils/member-display";
import { AddItemSheet } from "./AddItemSheet";
import { ShoppingItemCard } from "./ShoppingItemCard";
import { ShoppingItemSheet } from "./ShoppingItemSheet";
import { ShoppingQuickAdd } from "./ShoppingQuickAdd";
import type {
  ShoppingItem,
  ShoppingItemComment,
  ShoppingItemReactionSummary,
  ShoppingItemState,
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

/** Segment values — "all" plus the 4 derived states. */
type FilterValue = "all" | ShoppingItemState;

const FILTER_OPTIONS: ReadonlyArray<{ value: FilterValue; label: string }> = [
  { value: "all", label: SHOPPING_LIST_UI_STRINGS.filterAll },
  { value: "open", label: SHOPPING_LIST_UI_STRINGS.stateOpen },
  { value: "in_progress", label: SHOPPING_LIST_UI_STRINGS.stateInProgress },
  { value: "completed", label: SHOPPING_LIST_UI_STRINGS.stateCompleted },
  { value: "removed", label: SHOPPING_LIST_UI_STRINGS.stateRemoved },
];

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

  const [filter, setFilter] = React.useState<FilterValue>("all");
  const [completedExpanded, setCompletedExpanded] = React.useState(true);
  const [removedExpanded, setRemovedExpanded] = React.useState(true);

  const celebrantName = React.useMemo(() => {
    const celebrant = tripMembers.find((member) => member.is_celebrant);
    return celebrant ? resolveMemberName(memberMap, celebrant.id) : null;
  }, [tripMembers, memberMap]);

  const isViewerOrganizer = ORGANIZER_ROLES.has(viewer.role);

  const canDelete = (item: ShoppingItem) =>
    isViewerOrganizer || item.created_by_trip_member_id === viewer.id;

  // Group by derived state (spec §2), preserving `items`' created_at asc
  // order within each group (the array arrives already sorted that way).
  const grouped = React.useMemo(() => {
    const byState: Record<ShoppingItemState, ShoppingItem[]> = {
      open: [],
      in_progress: [],
      completed: [],
      removed: [],
    };
    for (const item of items) {
      byState[deriveShoppingItemState(item)].push(item);
    }
    return byState;
  }, [items]);

  // Active = open ∪ in_progress, open-group first then in-progress-group,
  // each internally created_at asc.
  const activeItems = [...grouped.open, ...grouped.in_progress];

  const renderCard = (item: ShoppingItem) => (
    <ShoppingItemCard
      key={item.id}
      item={item}
      memberMap={memberMap}
      viewerMemberId={viewer.id}
      canDelete={canDelete(item)}
      reactionSummary={reactionsByItem[item.id]}
      commentCount={commentCountByItem[item.id] ?? 0}
      onOpenItem={setOpenItemId}
    />
  );

  const renderFilteredTab = () => {
    const stateForFilter = filter as ShoppingItemState;
    const filtered = grouped[stateForFilter];
    if (filtered.length === 0) {
      return (
        <p className="text-muted-foreground text-sm">
          {SHOPPING_LIST_UI_STRINGS.filterTab_emptyNote}
        </p>
      );
    }
    return <ul>{filtered.map(renderCard)}</ul>;
  };

  const renderSectionedView = () => (
    <div className="flex flex-col gap-1">
      {activeItems.length > 0 ? <ul>{activeItems.map(renderCard)}</ul> : null}

      {grouped.completed.length > 0 ? (
        <CollapsibleSection
          label={SHOPPING_LIST_UI_STRINGS.stateCompleted}
          expanded={completedExpanded}
          onToggle={() => setCompletedExpanded((prev) => !prev)}
        >
          {grouped.completed.map(renderCard)}
        </CollapsibleSection>
      ) : null}

      {grouped.removed.length > 0 ? (
        <CollapsibleSection
          label={SHOPPING_LIST_UI_STRINGS.stateRemoved}
          expanded={removedExpanded}
          onToggle={() => setRemovedExpanded((prev) => !prev)}
        >
          {grouped.removed.map(renderCard)}
        </CollapsibleSection>
      ) : null}
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Task 7a — quick-add is the DEFAULT add path, always visible at the
          top (even on an empty list, so the first item doesn't need the
          full form). AddItemSheet sits directly under it, demoted to
          "Add with details" for category/cost/surprise. */}
      <div className="flex flex-col gap-2">
        <ShoppingQuickAdd tripId={tripId} />
        <AddItemSheet tripId={tripId} viewer={viewer} celebrantName={celebrantName} />
      </div>

      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {EMPTY_STATES.shopping_list_empty}
        </p>
      ) : (
        <>
          <div
            role="group"
            aria-label={A11Y_UI_STRINGS.shoppingListFilterGroup}
            className="border-border inline-flex flex-wrap gap-0.5 self-start rounded-xs border p-0.5"
          >
            {FILTER_OPTIONS.map((option) => {
              const active = filter === option.value;
              const count =
                option.value === "all" ? null : grouped[option.value].length;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(option.value)}
                  className={cn(
                    "focus-visible:ring-ring h-8 rounded-xs px-2.5 text-xs font-medium",
                    "focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {count !== null
                    ? `${option.label} · ${count}`
                    : option.label}
                </button>
              );
            })}
          </div>

          {filter === "all" ? renderSectionedView() : renderFilteredTab()}
        </>
      )}

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

interface CollapsibleSectionProps {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

/**
 * A divider that doubles as a collapse/expand toggle (spec §4). The
 * divider label carries NO count/fraction — dividers are a section
 * boundary, not a completion score.
 *
 * `aria-label` (not the bare visible label) supplies the accessible
 * name: `SHOPPING_LIST_UI_STRINGS.completeAction` is ALSO literally
 * "Completed" (the primary-action label on Open/In-progress rows), so a
 * bare "Completed" name here would collide with that button in every
 * `getByRole("button", { name })` lookup. `sectionToggle_aria_template`
 * disambiguates ("Show/hide Completed").
 */
function CollapsibleSection({
  label,
  expanded,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={SHOPPING_LIST_UI_STRINGS.sectionToggle_aria_template.replace(
          "{section}",
          label
        )}
        onClick={onToggle}
        className="text-muted-foreground mt-4 mb-1 flex w-full items-center gap-1 text-xs font-medium tracking-wide uppercase"
      >
        <span aria-hidden>{expanded ? "▾" : "▸"}</span>
        <span aria-hidden>{label}</span>
      </button>
      {expanded ? <ul>{children}</ul> : null}
    </div>
  );
}
