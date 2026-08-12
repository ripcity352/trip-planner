"use client";

/**
 * ShoppingItemCard — one row on the shopping list.
 *
 * Renders the item name, an optional category chip, an optional cost tag
 * (gap-C — `formatCents` + the `costTag_template`, never `formatCost`), a
 * claim affordance, a got-it toggle, and a delete affordance visible only
 * to the item's author or an organizer/co-organizer (absent otherwise —
 * never a gate message).
 *
 * gap-E: `bought` and `claimed_by` are independent columns. Marking an
 * item got-it preserves the claim; under the "Got it" divider
 * (`claimReadOnly`) the claim line renders read-only — no unclaim control.
 *
 * Every mutating control routes through `callAction` + `router.refresh()`
 * (no optimistic state — accepted MVP lag, spec §7). A single local
 * `errorKey` surfaces the last failure in a `role="alert"` region.
 *
 * P2-T5 — glanceable row social affordances (spec §12.6):
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
 *        control (checkbox, claim/unclaim, delete, the 👍 like button)
 *        stays a true SIBLING outside that button — never a descendant —
 *        so there is no nested-interactive-inside-a-button by
 *        construction, not by convention. Clicks on the name/chip/cost
 *        text bubble through real DOM ancestry to the button's own
 *        handler — this works identically in jsdom (verified by the
 *        component test) and in every real browser, because it's plain
 *        event bubbling, not CSS-dependent hit-testing. Trade-off: the
 *        claim-line and the like/note meta-row sit OUTSIDE the open
 *        button (they contain real controls), so tapping their own
 *        static text (e.g. "Dave is on it.") does not open the sheet —
 *        only the primary name/category/cost line and the explicit
 *        aria-labelled button itself do. Spec's "tap anywhere else"
 *        already treats the meta rows as their OWN independent controls
 *        (like/got-it/claim/delete), so this is the intended split.
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
  deleteShoppingItem,
  setClaim,
  toggleBought,
} from "@/lib/actions/shopping-list";
import { toggleShoppingReaction } from "@/lib/actions/shopping-item-reactions";
import { ROW_LIKE_EMOJI } from "@/lib/reactions/shopping-constants";
import type {
  ShoppingItem,
  ShoppingItemReactionSummary,
  TripMember,
} from "@/lib/db/types";

export interface ShoppingItemCardProps {
  item: ShoppingItem;
  memberMap: ReadonlyMap<string, TripMember>;
  /** Viewer's own trip_member id — never the raw user id. */
  viewerMemberId: string;
  /** Author (via created_by_trip_member_id) or organizer/co_organizer. */
  canDelete: boolean;
  /** True under the "Got it" divider — claim renders read-only there. */
  claimReadOnly: boolean;
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
  claimReadOnly,
  reactionSummary,
  commentCount,
  onOpenItem,
}: ShoppingItemCardProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);

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

  const claimerId = item.claimed_by_trip_member_id;
  const isClaimedByViewer = claimerId === viewerMemberId;

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

  const handleToggleBought = () => runMutation(() => toggleBought(item.id, !item.bought));
  const handleClaim = () => runMutation(() => setClaim(item.id, true));
  const handleUnclaim = () => runMutation(() => setClaim(item.id, false));
  // Distinct confirm copy when the item carries a live thread (≥1 comment
  // or reaction) — the cascade wipes that too, so the confirm names the
  // real cost instead of a generic "can't undo" (spec §12.6).
  const hasLiveThread =
    commentCount > 0 ||
    Object.values(reactionSummary?.counts ?? {}).some((c) => (c ?? 0) > 0);

  const handleDelete = () => {
    const confirmCopy = hasLiveThread
      ? SHOPPING_LIST_UI_STRINGS.itemDeleteConfirm
      : SHOPPING_LIST_UI_STRINGS.deleteConfirm;
    if (!window.confirm(confirmCopy)) return;
    runMutation(() => deleteShoppingItem(item.id));
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

  return (
    <li className="border-border flex flex-col gap-1.5 border-b py-3 last:border-b-0">
      <div className="flex items-start gap-2.5">
        {/* Real sibling, outside the row-open button — its own onChange. */}
        <input
          type="checkbox"
          checked={item.bought}
          disabled={isPending}
          onChange={handleToggleBought}
          aria-label={SHOPPING_LIST_UI_STRINGS.gotIt}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        <div className="min-w-0 flex-1">
          {/* Row-open tap target — a real <button> ANCESTOR of the
              purely-informational name/category/cost line (see module
              header for why: real DOM bubbling, not CSS layering). It
              contains ONLY plain text/spans — never an interactive
              descendant — unconditionally present so it covers
              struck/bought rows too. */}
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
                  item.bought && "text-muted-foreground line-through"
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
            {claimerId ? (
              <>
                <span className="text-muted-foreground">
                  {isClaimedByViewer
                    ? SHOPPING_LIST_UI_STRINGS.claimedByYou
                    : SHOPPING_LIST_UI_STRINGS.claimedBy_template.replace(
                        "{name}",
                        resolveMemberName(memberMap, claimerId)
                      )}
                </span>
                {!claimReadOnly && isClaimedByViewer ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={handleUnclaim}
                    className="text-muted-foreground underline underline-offset-2 disabled:opacity-60"
                  >
                    {SHOPPING_LIST_UI_STRINGS.unclaim}
                  </button>
                ) : null}
              </>
            ) : !claimReadOnly ? (
              <button
                type="button"
                disabled={isPending}
                onClick={handleClaim}
                className="text-foreground underline underline-offset-2 disabled:opacity-60"
              >
                {SHOPPING_LIST_UI_STRINGS.claimCta}
              </button>
            ) : null}

            {canDelete ? (
              <button
                type="button"
                disabled={isPending}
                onClick={handleDelete}
                className="text-muted-foreground ml-auto underline underline-offset-2 disabled:opacity-60"
              >
                {SHOPPING_LIST_UI_STRINGS.deleteCta}
              </button>
            ) : null}
          </div>

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
