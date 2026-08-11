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
 *   - Whole-row tap opens the detail sheet (P2-T6) via `onOpenItem`, even
 *     on a struck/bought row. Layering pattern (not nested-in-button, not
 *     stopPropagation): an absolutely-positioned full-row `<button>` sits
 *     BEHIND the row content at z-0; the content wrapper is `relative z-10`
 *     so it paints on top and independently captures clicks on the
 *     checkbox / like / delete controls. Clicks landing anywhere else on
 *     the row fall through to the overlay button underneath.
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
  const handleDelete = () => {
    if (!window.confirm(SHOPPING_LIST_UI_STRINGS.deleteConfirm)) return;
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

  return (
    <li className="border-border relative flex flex-col gap-1.5 border-b py-3 last:border-b-0">
      {/* Whole-row tap target — sits BEHIND the content below (z-0 vs.
          z-10) so it only catches clicks that fall through the row's
          non-interactive whitespace/text. Not nested inside the content —
          siblings, so the checkbox/like/delete buttons above it capture
          their own clicks first. Works on struck/bought rows too since
          it's unconditional. */}
      <button
        type="button"
        onClick={() => onOpenItem(item.id)}
        aria-label={SHOPPING_LIST_UI_STRINGS.openDetail_template.replace(
          "{name}",
          item.name
        )}
        className="absolute inset-0 z-0 rounded-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
      />
      <div className="relative z-10 flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={item.bought}
          disabled={isPending}
          onChange={handleToggleBought}
          aria-label={SHOPPING_LIST_UI_STRINGS.gotIt}
          className="mt-0.5 h-4 w-4 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
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
          </div>

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

      {errorKey || likeErrorKey ? (
        <p className={cn(ERROR_LINE_CLASS, "relative z-10 text-xs")} role="alert">
          {ERRORS[errorKey ?? (likeErrorKey as ErrorKey)]}
        </p>
      ) : null}
    </li>
  );
}
