"use client";

/**
 * ShoppingItemCard — one row on the shopping list (v2 lifecycle, Task 5a).
 *
 * Renders a leading state glyph, the item name/category chip/cost tag, one
 * attributed status line, exactly one primary action button, a `⋯`
 * overflow menu, and the unchanged 👍 like + 💬 count meta row.
 *
 * v2 row legibility (spec §4): a leading state glyph derived from
 * `deriveShoppingItemState` — neutral ink, NO red/green (traffic-light
 * glyphs are hard-banned). The glyph doubles as a one-tap "Completed"
 * affordance on the two NON-terminal states (Open, In-progress skips
 * straight to Completed); on the two terminal states (Completed, Removed)
 * it is a static `aria-hidden` indicator — re-completing a done item is
 * meaningless. Below the glyph: one muted, attributed status line, and
 * exactly one primary action button (row-calm — never more than one).
 *
 * gap-E carry-forward: `bought` and `claimed_by` are independent columns,
 * but v2 folds them into ONE derived `ShoppingItemState` via
 * `deriveShoppingItemState` (removed > completed > in_progress > open) —
 * this card never inspects the raw columns directly except to read
 * attribution ids for the status line.
 *
 * Every mutating control routes through `callAction` + `router.refresh()`
 * (no optimistic state — accepted MVP lag, spec §7). A single local
 * `errorKey` surfaces the last failure in a `role="alert"` region.
 *
 * P2-T5 — glanceable row social affordances (spec §12.6), UNCHANGED in v2:
 *   - A single 👍 like control, optimistic + per-emoji `inflight` ref-guard
 *     (clone of `reaction-row.tsx`'s single-emoji case). Count shown only
 *     when ≥1 (never "👍 0"); NO other emoji on the row.
 *   - A read-only 💬n note-count, shown only when ≥1.
 *   - When both are 0, the meta slot renders nothing (no placeholder).
 *   - Row-open (P2-T6) via `onOpenItem`, even on a struck/bought row.
 *
 *     TWO IMPLEMENTATIONS WERE TRIED for the row-open tap target; only the
 *     second is real:
 *
 *     1. (REJECTED) A CSS "stretched-link": a full-row `absolute inset-0`
 *        `<button>` SIBLING under a `relative z-10` content wrapper, with
 *        individual controls raised to `relative z-20`. This relies on
 *        the BROWSER's paint/hit-test order to route a tap on plain text
 *        to the sibling button underneath. Two problems: (a) it's
 *        genuinely broken if any ancestor around the plain content is
 *        ALSO given a blanket `relative z-*` (an earlier revision of this
 *        file did exactly that — the whole content wrapper out-ranked the
 *        overlay and silently ate every tap on the name/chips/whitespace,
 *        the CRITICAL bug this comment replaces); and (b) even fixed
 *        correctly, it is UNTESTABLE with `@testing-library` — jsdom has
 *        no layout/paint engine, so `fireEvent.click(screen.getByText(...))`
 *        dispatches directly on that node and only bubbles through its
 *        REAL DOM ancestors. A z-index-only relationship between SIBLINGS
 *        never enters into it, in jsdom or in RTL's `userEvent`, so this
 *        approach cannot be proven correct by any test — it is a "looks
 *        right in the browser, unverifiable in CI" trap.
 *
 *     2. (SHIPPED) A real DOM ancestor: the plain-text info line (name +
 *        category chip + cost tag) is wrapped in an actual `<button
 *        onClick={() => onOpenItem(item.id)}>`. Every interactive
 *        control (glyph, primary action, overflow menu, the 👍 like
 *        button) stays a true SIBLING outside that button — never a
 *        descendant — so there is no nested-interactive-inside-a-button by
 *        construction, not by convention. Clicks on the name/chip/cost
 *        text bubble through real DOM ancestry to the button's own
 *        handler — this works identically in jsdom (verified by the
 *        component test) and in every real browser, because it's plain
 *        event bubbling, not CSS-dependent hit-testing. Trade-off: the
 *        status line, primary action, overflow menu, and like/note meta
 *        row sit OUTSIDE the open button (they contain real controls), so
 *        tapping their own static text (e.g. "Open") does not open the
 *        sheet — only the primary name/category/cost line and the
 *        explicit aria-labelled button itself do. Spec's "tap anywhere
 *        else" already treats those rows as their OWN independent
 *        controls, so this is the intended split.
 *
 * Pickers + reopen-with-note (Task 5b, spec §6): assign/re-assign
 * (`⋯` menu → `ShoppingItemMenu`), who-completed (glyph + primary
 * "Completed" button, both routed through `handleComplete`), and the
 * reopen-with-note inline panel (`ShoppingReopenForm`) all live in their
 * own files under this directory — the card only composes them and owns
 * a single `openPanel: "assign" | "complete" | "reopen" | null` state
 * that decides which one (if any) is expanded below the row. A single
 * enum (rather than three independent booleans) makes mutual exclusion
 * structural — setting one panel open always clears whichever other one
 * was open, so two panels can never render stacked.
 *
 * "Close here, auto-open there" pattern: `ShoppingItemMenu`'s Assign…/
 * Re-assign… item closes ITS OWN menu and calls `onAssignClick`, which
 * just flips `assignPickerOpen`. The card then conditionally renders a
 * `ShoppingMemberPicker` with a hard-coded `open` (no second click on
 * its own trigger needed — the picker appears already expanded). Same
 * shape for the who-completed picker. `ShoppingReopenForm` is simpler —
 * it owns its own full inline panel, the card just toggles whether it's
 * mounted.
 *
 * Who-completed ambiguity rule (spec §6): completing your OWN claimed
 * item is a same-tap no-prompt mutation; completing anyone else's item
 * (someone else's in-progress claim, OR an unclaimed Open item) opens
 * the picker, default-highlighted to the on-hook member
 * (`claimed_by ?? viewer`).
 *
 * Superseded v1 actions (`toggleBought`, `setClaim`) are removed from
 * THIS component's imports/usage but their exports are NOT deleted from
 * `lib/actions/shopping-list.ts` — that's a LATER task (5c), after
 * `ShoppingItemSheet` stops using `setClaim`.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { callAction } from "@/lib/ui/call-action";
import { SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { formatCents } from "@/lib/utils/format-cents";
import { resolveMemberName } from "@/lib/utils/member-display";
import {
  assignShoppingItem,
  completeShoppingItem,
  deleteShoppingItem,
  removeShoppingItem,
} from "@/lib/actions/shopping-list";
import { deriveShoppingItemState } from "@/lib/db/shopping-list";
import { toggleShoppingReaction } from "@/lib/actions/shopping-item-reactions";
import { ROW_LIKE_EMOJI } from "@/lib/reactions/shopping-constants";
import { ShoppingItemMenu } from "./ShoppingItemMenu";
import { ShoppingMemberPicker } from "./ShoppingMemberPicker";
import { ShoppingReopenForm } from "./ShoppingReopenForm";
import type {
  ShoppingItem,
  ShoppingItemReactionSummary,
  ShoppingItemState,
  TripMember,
} from "@/lib/db/types";

/** Neutral state glyphs (spec §4) — never traffic-light red/green. */
const STATE_GLYPH: Record<ShoppingItemState, string> = {
  open: "○",
  in_progress: "◐",
  completed: "✓",
  removed: "⊘",
};

const TERMINAL_STATES = new Set<ShoppingItemState>(["completed", "removed"]);

export interface ShoppingItemCardProps {
  item: ShoppingItem;
  memberMap: ReadonlyMap<string, TripMember>;
  /** Viewer's own trip_member id — never the raw user id. */
  viewerMemberId: string;
  /** Author (via created_by_trip_member_id) or organizer/co_organizer. */
  canDelete: boolean;
  /** Folded reaction summary (counts + viewer's own) — never raw rows. */
  reactionSummary: ShoppingItemReactionSummary | undefined;
  /** Note-thread count, folded server-side — never raw comment rows. */
  commentCount: number;
  /** Opens the P2-T6 detail sheet for this item. */
  onOpenItem: (itemId: string) => void;
}

export function ShoppingItemCard({
  item,
  memberMap,
  viewerMemberId,
  canDelete,
  reactionSummary,
  commentCount,
  onOpenItem,
}: ShoppingItemCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);

  // 5b pickers/reopen-form — ONE enum, not three independent booleans:
  // enforces "at most one open at a time" structurally (setting a new
  // panel always replaces/clears any other), rather than relying on every
  // open handler to remember to clear the other two flags.
  const [openPanel, setOpenPanel] = React.useState<
    "assign" | "complete" | "reopen" | null
  >(null);

  // Ordered list for the pickers — `memberMap` stays the lookup the rest
  // of the row already uses for name resolution.
  const tripMembers = React.useMemo(
    () => Array.from(memberMap.values()),
    [memberMap]
  );

  // Like state seeds from the folded summary — same "initial only, no
  // resync effect" pattern as `reaction-row.tsx`: an in-flight optimistic
  // toggle already reflects the truth on success, and a full resync
  // arrives via the next `router.refresh()` remount-free reconciliation
  // (accepted "lag one refresh" MVP behavior, spec §12.6).
  const [likeCount, setLikeCount] = React.useState(
    reactionSummary?.counts[ROW_LIKE_EMOJI] ?? 0
  );
  const [likedByViewer, setLikedByViewer] = React.useState(
    reactionSummary?.mine.includes(ROW_LIKE_EMOJI) ?? false
  );
  const [likeErrorKey, setLikeErrorKey] = React.useState<ErrorKey | null>(null);
  const inflightLike = React.useRef(false);

  const costTag =
    item.cost_cents != null
      ? SHOPPING_LIST_UI_STRINGS.costTag_template.replace(
          "{amount}",
          formatCents(item.cost_cents, item.currency)
        )
      : null;

  const state = deriveShoppingItemState(item);
  const isTerminal = TERMINAL_STATES.has(state);
  const claimerId = item.claimed_by_trip_member_id;

  const runMutation = (action: () => Promise<{ ok: true } | { ok: false; errorKey: ErrorKey }>) => {
    setErrorKey(null);
    startTransition(async () => {
      const result = await callAction(action);
      if (!result.ok) {
        setErrorKey(result.errorKey);
        return;
      }
      router.refresh();
    });
  };

  // Who-completed default (spec §6): the on-hook claimer if any, else
  // the viewer — used both as the immediate-complete target (own claim)
  // and as the picker's default-highlighted member (anyone else's).
  const completedByDefault = claimerId ?? viewerMemberId;

  const handleClaimSelf = () =>
    runMutation(() => assignShoppingItem(item.id, viewerMemberId));

  // Own claimed item → complete immediately, no prompt. Anything else
  // (someone else's in-progress claim, or an unclaimed Open item) opens
  // the who-completed picker instead of guessing. Shared by the glyph
  // tap AND the primary "Completed" button (spec §6).
  const handleComplete = () => {
    if (claimerId === viewerMemberId) {
      runMutation(() => completeShoppingItem(item.id, viewerMemberId));
      return;
    }
    setOpenPanel("complete");
  };

  const handleCompleteSelect = (memberId: string | null) => {
    setOpenPanel(null);
    // Defensive only — this picker never renders the "Open — no one"
    // item (`includeOpenNoOne={false}`), so `memberId` is never null in
    // practice.
    if (memberId === null) return;
    runMutation(() => completeShoppingItem(item.id, memberId));
  };

  const handleAssignSelect = (memberId: string | null) => {
    setOpenPanel(null);
    runMutation(() => assignShoppingItem(item.id, memberId));
  };

  const handleRemove = () => runMutation(() => removeShoppingItem(item.id));
  const handlePurge = () => runMutation(() => deleteShoppingItem(item.id));

  const handleReopenConfirmed = () => {
    setOpenPanel(null);
    router.refresh();
  };

  const handleToggleLike = () => {
    if (inflightLike.current) return;

    const previousCount = likeCount;
    const previousLiked = likedByViewer;
    const nextActive = !previousLiked;

    setLikeErrorKey(null);
    // Optimistic flip — the actor's own tap must not wait on a round-trip.
    setLikedByViewer(nextActive);
    setLikeCount(Math.max(0, previousCount + (nextActive ? 1 : -1)));

    inflightLike.current = true;
    void (async () => {
      try {
        const result = await toggleShoppingReaction({
          itemId: item.id,
          emoji: ROW_LIKE_EMOJI,
          active: nextActive,
        });
        if (!result.ok) {
          setLikeCount(previousCount);
          setLikedByViewer(previousLiked);
          setLikeErrorKey(result.errorKey);
          return;
        }
        router.refresh();
      } catch (err) {
        console.error("[shopping-item-card] toggleShoppingReaction threw:", err);
        setLikeCount(previousCount);
        setLikedByViewer(previousLiked);
        setLikeErrorKey("network");
      } finally {
        inflightLike.current = false;
      }
    })();
  };

  const showMetaSlot = likeCount > 0 || commentCount > 0;
  // `??` (not `||`) so TS narrows this to `ErrorKey | null` without a
  // cast — `errorKey` and `likeErrorKey` are each already `ErrorKey |
  // null`, and `??` picks the first non-null/non-undefined operand.
  const displayedErrorKey = errorKey ?? likeErrorKey;

  const statusLine = (() => {
    switch (state) {
      case "open":
        return SHOPPING_LIST_UI_STRINGS.stateOpen;
      case "in_progress":
        return claimerId === viewerMemberId
          ? SHOPPING_LIST_UI_STRINGS.inProgressYou
          : SHOPPING_LIST_UI_STRINGS.inProgressThem_template.replace(
              "{name}",
              // `claimerId` is non-null by construction here — `state`
              // only derives "in_progress" when claimed_by is set — but
              // the type is `string | null`, so fall back to "" (an
              // unresolvable id already reads as the roster fallback
              // name via `resolveMemberName`).
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

  return (
    <li className="border-border flex flex-col gap-1.5 border-b py-3 last:border-b-0">
      <div className="flex items-start gap-2.5">
        {/* Real sibling, outside the row-open button. Non-terminal states:
            a one-tap "Completed" affordance. Terminal states: a static
            indicator — re-completing a done/removed item is meaningless. */}
        {isTerminal ? (
          <span aria-hidden className="mt-0.5 shrink-0 text-base leading-none">
            {STATE_GLYPH[state]}
          </span>
        ) : (
          <button
            type="button"
            disabled={isPending}
            onClick={handleComplete}
            aria-label={SHOPPING_LIST_UI_STRINGS.completeAction}
            className="text-foreground mt-0.5 shrink-0 text-base leading-none disabled:opacity-60"
          >
            {STATE_GLYPH[state]}
          </button>
        )}
        <div className="min-w-0 flex-1">
          {/* Row-open tap target — a real <button> ANCESTOR of the
              purely-informational name/category/cost line (see module
              header for why: real DOM bubbling, not CSS layering). It
              contains ONLY plain text/spans — never an interactive
              descendant — unconditionally present so it covers
              struck/completed/removed rows too. */}
          <button
            type="button"
            onClick={() => onOpenItem(item.id)}
            aria-label={SHOPPING_LIST_UI_STRINGS.openDetail_template.replace(
              "{name}",
              item.name
            )}
            className="w-full rounded-xs text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span
                className={cn(
                  "text-sm",
                  state === "completed" && "text-muted-foreground line-through"
                )}
              >
                {item.name}
              </span>
              {item.category ? (
                <span className="text-muted-foreground rounded-full border border-border px-2 py-0.5 text-xs">
                  {item.category}
                </span>
              ) : null}
              {costTag ? (
                <span className="text-muted-foreground text-xs">{costTag}</span>
              ) : null}
            </span>
          </button>

          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">{statusLine}</span>

            {/* Exactly one primary action per state (row-calm, spec §4). */}
            {state === "open" ? (
              <button
                type="button"
                disabled={isPending}
                onClick={handleClaimSelf}
                className="text-foreground ml-auto underline underline-offset-2 disabled:opacity-60"
              >
                {SHOPPING_LIST_UI_STRINGS.claimSelfAction}
              </button>
            ) : null}
            {state === "in_progress" ? (
              <button
                type="button"
                disabled={isPending}
                onClick={handleComplete}
                className="text-foreground ml-auto underline underline-offset-2 disabled:opacity-60"
              >
                {SHOPPING_LIST_UI_STRINGS.completeAction}
              </button>
            ) : null}
            {/* Hidden once the reopen form is open — its own confirm
                button carries the same `reopenAction` label, and two
                same-labelled buttons on one row is both confusing and
                ambiguous for `getByRole`. */}
            {isTerminal && openPanel !== "reopen" ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() => setOpenPanel("reopen")}
                className="text-foreground ml-auto underline underline-offset-2 disabled:opacity-60"
              >
                {SHOPPING_LIST_UI_STRINGS.reopenAction}
              </button>
            ) : null}

            {/* `⋯` overflow menu — every row (leaf component, Task 5b). */}
            <ShoppingItemMenu
              isTerminal={isTerminal}
              isClaimed={claimerId !== null}
              canDelete={canDelete}
              onRemove={handleRemove}
              onAssignClick={() => setOpenPanel("assign")}
              onPurge={handlePurge}
            />
          </div>

          {/* Assign/Re-assign picker (5b, spec §6 rule #8) — opened by
              `ShoppingItemMenu`'s Assign…/Re-assign… item. Controlled
              `open` so it appears already expanded, no second click. */}
          {openPanel === "assign" ? (
            <div className="mt-1.5 text-xs">
              <ShoppingMemberPicker
                members={tripMembers}
                memberMap={memberMap}
                includeOpenNoOne
                triggerLabel={
                  claimerId !== null
                    ? SHOPPING_LIST_UI_STRINGS.reassignAction
                    : SHOPPING_LIST_UI_STRINGS.assignAction
                }
                onSelect={handleAssignSelect}
                open
                onOpenChange={(next) => {
                  if (!next) setOpenPanel(null);
                }}
              />
            </div>
          ) : null}

          {/* Who-completed picker (5b, spec §6) — opened by `handleComplete`
              whenever the actor isn't completing their own claimed item. */}
          {openPanel === "complete" ? (
            <div className="mt-1.5 text-xs">
              <ShoppingMemberPicker
                members={tripMembers}
                memberMap={memberMap}
                includeOpenNoOne={false}
                triggerLabel={SHOPPING_LIST_UI_STRINGS.completedByPickerTitle}
                defaultMemberId={completedByDefault}
                onSelect={handleCompleteSelect}
                open
                onOpenChange={(next) => {
                  if (!next) setOpenPanel(null);
                }}
              />
            </div>
          ) : null}

          {/* Reopen-with-note inline panel (5b, spec §6). */}
          {openPanel === "reopen" ? (
            <ShoppingReopenForm
              itemId={item.id}
              members={tripMembers}
              memberMap={memberMap}
              onCancel={() => setOpenPanel(null)}
              onConfirmed={handleReopenConfirmed}
            />
          ) : null}

          {showMetaSlot ? (
            <div className="mt-1 flex items-center gap-3 text-xs">
              {likeCount > 0 ? (
                <button
                  type="button"
                  aria-pressed={likedByViewer}
                  aria-label={SHOPPING_LIST_UI_STRINGS.likeAria}
                  onClick={handleToggleLike}
                  className={cn(
                    "inline-flex items-center gap-1 tabular-nums",
                    likedByViewer
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span aria-hidden>{ROW_LIKE_EMOJI}</span>
                  <span>{likeCount}</span>
                </button>
              ) : null}

              {commentCount > 0 ? (
                <span className="text-muted-foreground inline-flex items-center gap-1 tabular-nums">
                  <span aria-hidden>💬</span>
                  {commentCount}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {displayedErrorKey ? (
        <p className={cn(ERROR_LINE_CLASS, "text-xs")} role="alert">
          {ERRORS[displayedErrorKey]}
        </p>
      ) : null}
    </li>
  );
}
