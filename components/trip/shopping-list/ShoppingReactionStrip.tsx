"use client";

/**
 * ShoppingReactionStrip — the full six-emoji reaction strip in the P2-T6
 * detail sheet (spec §12.6). Clone of `reaction-row.tsx`'s optimistic +
 * per-emoji `inflight` ref-guard toggle, adapted for:
 *   - the FULL fixed set always visible (no collapse/expand — the row's
 *     👍-only affordance already handles the glanceable case; the sheet is
 *     the deliberate tap-in surface for the rest, incl. 👎).
 *   - each pill a tappable GHOST when its count is 0 (never hidden) —
 *     unlike the announcement strip, which only shows in-play emoji.
 *   - neutral per-pill aria-labels from `SHOPPING_REACTION_ARIA` — never
 *     "dislike"/"downvote" for 👎.
 *   - `onGone()` — surfaced when a toggle returns `rls_denied` on an item
 *     that was present when the sheet opened; the parent sheet treats that
 *     as the item having vanished elsewhere (see ShoppingItemSheet).
 */

import * as React from "react";

import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { callAction } from "@/lib/ui/call-action";
import { useRouter } from "next/navigation";
import { toggleShoppingReaction } from "@/lib/actions/shopping-item-reactions";
import {
  SHOPPING_REACTION_ARIA,
  SHOPPING_REACTION_EMOJI,
  type ShoppingReactionEmoji,
} from "@/lib/reactions/shopping-constants";
import { SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import type { ShoppingItemReactionSummary } from "@/lib/db/types";

const CHIP_BASE_CLASS =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xs border px-2.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none";

export interface ShoppingReactionStripProps {
  itemId: string;
  initialCounts: ShoppingItemReactionSummary["counts"];
  initialMine: readonly ShoppingReactionEmoji[];
  /** Called when a toggle discovers the parent item is gone (rls_denied). */
  onGone: () => void;
}

export function ShoppingReactionStrip({
  itemId,
  initialCounts,
  initialMine,
  onGone,
}: ShoppingReactionStripProps) {
  const router = useRouter();
  const [counts, setCounts] =
    React.useState<ShoppingItemReactionSummary["counts"]>(initialCounts);
  const [mine, setMine] =
    React.useState<readonly ShoppingReactionEmoji[]>(initialMine);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  // Per-emoji in-flight guard — see reaction-row.tsx's module header for
  // why this is a ref (no disabled flicker) rather than a disabled prop.
  const inflight = React.useRef<Set<ShoppingReactionEmoji>>(new Set());

  const handleToggle = React.useCallback(
    (emoji: ShoppingReactionEmoji) => {
      if (inflight.current.has(emoji)) return;

      const previousCounts = counts;
      const previousMine = mine;
      const nextActive = !mine.includes(emoji);

      setErrorKey(null);
      // Optimistic flip — the actor's own tap must not wait on a round-trip.
      setMine(
        nextActive
          ? [...previousMine, emoji]
          : previousMine.filter((e) => e !== emoji)
      );
      setCounts({
        ...previousCounts,
        [emoji]: Math.max(
          0,
          (previousCounts[emoji] ?? 0) + (nextActive ? 1 : -1)
        ),
      });

      inflight.current.add(emoji);
      void (async () => {
        try {
          const result = await callAction(() =>
            toggleShoppingReaction({ itemId, emoji, active: nextActive })
          );
          if (!result.ok) {
            setCounts(previousCounts);
            setMine(previousMine);
            if (result.errorKey === "rls_denied") {
              onGone();
              return;
            }
            setErrorKey(result.errorKey);
            return;
          }
          router.refresh();
        } finally {
          inflight.current.delete(emoji);
        }
      })();
    },
    [itemId, counts, mine, onGone, router]
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="group"
        aria-label={SHOPPING_LIST_UI_STRINGS.reactionsGroup_aria}
        className="flex flex-wrap items-center gap-1.5"
      >
        {SHOPPING_REACTION_EMOJI.map((emoji) => {
          const count = counts[emoji] ?? 0;
          const isMine = mine.includes(emoji);
          return (
            <button
              key={emoji}
              type="button"
              aria-pressed={isMine}
              aria-label={SHOPPING_REACTION_ARIA[emoji]}
              onClick={() => handleToggle(emoji)}
              className={cn(
                CHIP_BASE_CLASS,
                isMine
                  ? "border-primary bg-primary/10"
                  : "border-border bg-muted hover:bg-muted/80"
              )}
            >
              <span aria-hidden>{emoji}</span>
              {count > 0 && (
                <span
                  className={cn(
                    "text-xs font-medium tabular-nums",
                    isMine ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-xs")}>
          {ERRORS[errorKey]}
        </p>
      ) : null}
    </div>
  );
}
