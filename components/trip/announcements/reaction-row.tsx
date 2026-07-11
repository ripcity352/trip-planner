"use client";

/**
 * ReactionRow — fixed-set emoji acks under an announcement card (#389).
 *
 * Aggregate-only by design: emoji + count, never names. Collapsed, it
 * shows only emoji somebody has used (non-zero counts) plus a quiet
 * add affordance; the affordance expands the full fixed set (6 — the
 * hard cap, no reaction inflation). Works for every role including the
 * celebrant on announcements they can see — this is the celebrant's
 * ack channel too (rule 11).
 *
 * Optimistic local state pattern (same as item-rsvp-chip.tsx):
 *   1. Tap → flip count + pressed state immediately
 *   2. Call toggleReactionAction with the DESIRED end state (replay-safe)
 *   3. On error → roll back and surface an inline copy-palette alert
 *
 * Buttons stay enabled while a toggle is in flight; a per-emoji
 * in-flight guard swallows re-taps instead (a disabled flicker on a
 * 44px chip reads as jank, and the desired-state action makes an
 * accidental double-fire harmless anyway).
 *
 * Tap targets are min-h-11/min-w-11 (44px — Apple HIG axis, see
 * design-system.md touch-target hit-slop).
 */

import * as React from "react";
import { SmilePlus } from "lucide-react";

import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { toggleReactionAction } from "@/lib/actions/announcement-reactions";
import { REACTION_EMOJI, type ReactionEmoji } from "@/lib/reactions/constants";
import { M5_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import type { AnnouncementReactionSummary } from "@/lib/db/types";

export interface ReactionRowProps {
  announcementId: string;
  /** emoji → count as fetched server-side; only non-zero entries. */
  initialCounts: AnnouncementReactionSummary["counts"];
  /** The viewer's own reactions on this announcement. */
  initialMine: readonly ReactionEmoji[];
}

const CHIP_BASE_CLASS =
  "inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-xs border px-2.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none";

export function ReactionRow({
  announcementId,
  initialCounts,
  initialMine,
}: ReactionRowProps) {
  const [counts, setCounts] =
    React.useState<AnnouncementReactionSummary["counts"]>(initialCounts);
  const [mine, setMine] = React.useState<readonly ReactionEmoji[]>(initialMine);
  const [expanded, setExpanded] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  // Per-emoji in-flight guard — see the module header for why this is a
  // ref (no disabled flicker) rather than a disabled prop.
  const inflight = React.useRef<Set<ReactionEmoji>>(new Set());

  const handleToggle = React.useCallback(
    (emoji: ReactionEmoji) => {
      if (inflight.current.has(emoji)) return;

      const previousCounts = counts;
      const previousMine = mine;
      const nextActive = !mine.includes(emoji);

      setErrorKey(null);
      setExpanded(false);
      // Optimistic flip — the actor's own view must not depend on a
      // round-trip (F2 lesson, #400/#410).
      setMine(
        nextActive
          ? [...previousMine, emoji]
          : previousMine.filter((e) => e !== emoji)
      );
      setCounts({
        ...previousCounts,
        [emoji]: Math.max(0, (previousCounts[emoji] ?? 0) + (nextActive ? 1 : -1)),
      });

      inflight.current.add(emoji);
      void (async () => {
        try {
          const result = await toggleReactionAction({
            announcementId,
            emoji,
            active: nextActive,
          });
          if (!result.ok) {
            setCounts(previousCounts);
            setMine(previousMine);
            setErrorKey(result.errorKey);
          }
        } catch (err) {
          console.error("[reaction-row] toggleReactionAction threw:", err);
          setCounts(previousCounts);
          setMine(previousMine);
          setErrorKey("network");
        } finally {
          inflight.current.delete(emoji);
        }
      })();
    },
    [announcementId, counts, mine]
  );

  // Fixed-set order always; collapsed shows only emoji in play.
  const visibleEmoji = REACTION_EMOJI.filter(
    (emoji) => expanded || (counts[emoji] ?? 0) > 0
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div
        role="group"
        aria-label={M5_UI_STRINGS.reactions_picker_aria}
        className="flex flex-wrap items-center gap-1.5"
      >
        {visibleEmoji.map((emoji) => {
          const count = counts[emoji] ?? 0;
          const isMine = mine.includes(emoji);
          return (
            <button
              key={emoji}
              type="button"
              aria-pressed={isMine}
              aria-label={M5_UI_STRINGS.reactions_toggle_aria_template.replace(
                "{emoji}",
                emoji
              )}
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

        <button
          type="button"
          aria-label={M5_UI_STRINGS.reactions_add_aria}
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
          className={cn(
            CHIP_BASE_CLASS,
            "border-dashed border-border bg-transparent text-muted-foreground hover:bg-muted/60"
          )}
        >
          <SmilePlus className="size-4" aria-hidden />
        </button>
      </div>

      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-xs")}>
          {ERRORS[errorKey]}
        </p>
      ) : null}
    </div>
  );
}
