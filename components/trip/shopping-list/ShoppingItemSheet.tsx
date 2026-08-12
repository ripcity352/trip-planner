"use client";

/**
 * ShoppingItemSheet — the P2-T6 detail bottom sheet (spec §12.6).
 *
 * Hand-rolled panel (this repo has no shadcn Sheet convention for this —
 * clone of the `add-expense-sheet` conditional-render pattern, adapted to
 * an always-open-when-mounted overlay rather than a toggled inline form).
 * Renders ONLY when mounted — `ShoppingList` controls that by keying
 * `openItemId`; there is no internal `open` state here.
 *
 * Dismiss: an explicit ✕ button (top-right) and a backdrop tap both call
 * `onClose`. (A swipe-to-dismiss gesture is spec'd as nice-to-have, not
 * the floor — not implemented here; ✕ + backdrop satisfy the floor.)
 *
 * Freshness (no realtime, spec §12.6): renders from props filtered to this
 * item. A mutation the VIEWER makes calls `router.refresh()` (inside the
 * child components), which re-fetches the page and flows fresh props back
 * down — others' reactions/notes only appear after the viewer's own next
 * action or a reload. That's accepted MVP behavior, not a bug.
 *
 * Item-gone handling: every child mutation surface (reaction strip, notes
 * thread delete, note composer) reports a `rls_denied` result up via
 * `handleGone`, NOT the generic error line — the spec's read is that an
 * item present when the sheet opened returning rls_denied on a *write* can
 * only mean it was deleted elsewhere mid-session (the parent EXISTS check
 * in RLS now fails). `handleGone` flips the sheet into a terminal "gone"
 * state (replaces the body with `ERRORS.shopping_item_gone`) and calls
 * `onClose` — the caller's `openItemId` state clears, which in the real
 * `ShoppingList` unmounts this component on the next render.
 */

import * as React from "react";
import { X } from "lucide-react";
import { formatDistance } from "date-fns";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { deriveShoppingItemState } from "@/lib/db/shopping-list";
import {
  resolveContentAuthorName,
  resolveMemberName,
} from "@/lib/utils/member-display";
import { formatCents } from "@/lib/utils/format-cents";
import { SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS } from "@/lib/copy/errors";
import { ShoppingReactionStrip } from "./ShoppingReactionStrip";
import { ShoppingNotesThread } from "./ShoppingNotesThread";
import { ShoppingNoteComposer } from "./ShoppingNoteComposer";
import type {
  ShoppingItem,
  ShoppingItemComment,
  ShoppingItemReactionSummary,
  TripMember,
} from "@/lib/db/types";
import type { ViewerMember } from "@/lib/db/trips";

const ORGANIZER_ROLES = new Set(["organizer", "co_organizer"]);

export interface ShoppingItemSheetProps {
  item: ShoppingItem;
  reactionSummary?: ShoppingItemReactionSummary;
  comments: readonly ShoppingItemComment[];
  memberMap: ReadonlyMap<string, TripMember>;
  viewer: ViewerMember;
  /** Server-provided reference clock — see module header re: hydration. */
  now: Date;
  onClose: () => void;
}

export function ShoppingItemSheet({
  item,
  reactionSummary,
  comments,
  memberMap,
  viewer,
  now,
  onClose,
}: ShoppingItemSheetProps) {
  const [isGone, setIsGone] = React.useState(false);
  // Optimistic notes appended locally between "submitted" and the next
  // `router.refresh()` reconciling real props. Deduped against `comments`
  // by idempotency_key so a refresh never double-renders one.
  const [optimisticComments, setOptimisticComments] = React.useState<
    readonly ShoppingItemComment[]
  >([]);

  const handleGone = React.useCallback(() => {
    setIsGone(true);
    onClose();
  }, [onClose]);

  const mergedComments = React.useMemo(() => {
    const known = new Set(
      comments
        .map((c) => c.idempotency_key)
        .filter((k): k is string => k != null)
    );
    const stillPending = optimisticComments.filter(
      (c) => c.idempotency_key == null || !known.has(c.idempotency_key)
    );
    return [...comments, ...stillPending];
  }, [comments, optimisticComments]);

  const handleNoteSubmitted = (comment: ShoppingItemComment) => {
    setOptimisticComments((prev) => [...prev, comment]);
  };

  const isViewerOrganizer = ORGANIZER_ROLES.has(viewer.role);

  const authorName = resolveContentAuthorName(
    memberMap,
    item.created_by_trip_member_id
  );
  const addedWhen = formatDistance(new Date(item.created_at), now, {
    addSuffix: true,
  });
  const costTag =
    item.cost_cents != null
      ? SHOPPING_LIST_UI_STRINGS.costTag_template.replace(
          "{amount}",
          formatCents(item.cost_cents, item.currency)
        )
      : null;

  // Read-only v2 status line (mirrors ShoppingItemCard's statusLine — the
  // sheet no longer offers a claim toggle; all mutation lives on the card,
  // Tasks 5a/5b). `resolveMemberName` (not `resolveContentAuthorName`) —
  // these ids are roster members, not content authors, so the "Guest"
  // fallback (not "Someone") applies.
  const state = deriveShoppingItemState(item);
  const claimerId = item.claimed_by_trip_member_id;
  const statusLine = (() => {
    switch (state) {
      case "open":
        return SHOPPING_LIST_UI_STRINGS.stateOpen;
      case "in_progress":
        return claimerId === viewer.id
          ? SHOPPING_LIST_UI_STRINGS.inProgressYou
          : SHOPPING_LIST_UI_STRINGS.inProgressThem_template.replace(
              "{name}",
              resolveMemberName(memberMap, claimerId ?? "")
            );
      case "completed":
        return SHOPPING_LIST_UI_STRINGS.completedBy_template.replace(
          "{name}",
          resolveMemberName(memberMap, item.completed_by_trip_member_id ?? "")
        );
      case "removed":
        return SHOPPING_LIST_UI_STRINGS.removedBy_template.replace(
          "{name}",
          resolveMemberName(memberMap, item.removed_by_trip_member_id ?? "")
        );
    }
  })();

  // Provenance line (rule #8): only for an on-behalf assign — the assigner
  // differs from the assignee. A self-claim or an unclaimed item leaves
  // `claim_assigned_by_trip_member_id` null, so this stays hidden.
  const showProvenance =
    item.claim_assigned_by_trip_member_id !== null &&
    item.claim_assigned_by_trip_member_id !== item.claimed_by_trip_member_id;
  const provenanceLine = showProvenance
    ? SHOPPING_LIST_UI_STRINGS.assignedByProvenance_template
        .replace(
          "{assigner}",
          resolveMemberName(
            memberMap,
            item.claim_assigned_by_trip_member_id ?? ""
          )
        )
        .replace(
          "{assignee}",
          resolveMemberName(memberMap, item.claimed_by_trip_member_id ?? "")
        )
    : null;

  if (isGone) {
    return (
      <ShoppingSheetShell onBackdropClick={onClose}>
        <div className="flex flex-col gap-3 p-4">
          <p role="alert" className="text-sm">
            {ERRORS.shopping_item_gone}
          </p>
          <Button type="button" variant="ghost" onClick={onClose}>
            {SHOPPING_LIST_UI_STRINGS.sheetClose_aria}
          </Button>
        </div>
      </ShoppingSheetShell>
    );
  }

  return (
    <ShoppingSheetShell onBackdropClick={onClose}>
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between gap-2 border-b border-border p-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-base font-medium break-words">{item.name}</h2>
            <p className="text-muted-foreground text-xs">
              {SHOPPING_LIST_UI_STRINGS.addedBy_template
                .replace("{name}", authorName)
                .replace("{when}", addedWhen)}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              {costTag ? (
                <span className="text-muted-foreground">{costTag}</span>
              ) : null}
              <span className="text-muted-foreground">{statusLine}</span>
            </div>
            {provenanceLine ? (
              <p className="text-muted-foreground text-xs">
                {provenanceLine}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            aria-label={SHOPPING_LIST_UI_STRINGS.sheetClose_aria}
            onClick={onClose}
            className="text-muted-foreground shrink-0 rounded-xs p-2 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-6">
            <ShoppingReactionStrip
              itemId={item.id}
              initialCounts={reactionSummary?.counts ?? {}}
              initialMine={reactionSummary?.mine ?? []}
              onGone={handleGone}
            />

            <ShoppingNotesThread
              comments={mergedComments}
              memberMap={memberMap}
              viewerMemberId={viewer.id}
              isViewerOrganizer={isViewerOrganizer}
              now={now}
              onGone={handleGone}
            />
          </div>
        </div>

        <div className="border-t border-border p-3">
          <ShoppingNoteComposer
            itemId={item.id}
            onSubmitted={handleNoteSubmitted}
            onGone={handleGone}
          />
        </div>
      </div>
    </ShoppingSheetShell>
  );
}

/**
 * The hand-rolled overlay + ~90%-height panel shell. Split out so the
 * "gone" terminal state and the normal body share the same chrome without
 * duplicating the backdrop/positioning classes.
 */
function ShoppingSheetShell({
  onBackdropClick,
  children,
}: {
  onBackdropClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* Backdrop — dims the list behind the sheet; tap dismisses. */}
      <button
        type="button"
        aria-label={SHOPPING_LIST_UI_STRINGS.sheetClose_aria}
        onClick={onBackdropClick}
        className="absolute inset-0 bg-black/50"
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative z-10 flex h-[90vh] flex-col rounded-t-md border-t border-border bg-background shadow-lg"
        )}
      >
        {children}
      </div>
    </div>
  );
}
