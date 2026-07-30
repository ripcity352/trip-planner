"use client";

/**
 * LegDaySuggestPrompt (#525) — the one-question card TravelLegFormSheet
 * shows after a leg saves with implied day-chip changes.
 *
 * "Suggest, don't write": applying calls the existing
 * `setMemberDayAction` once per day (fresh idempotency key each — rule
 * 9); dismissing does nothing and the sheet remembers the leg version
 * so the same save never re-asks. Partial failure keeps the prompt up
 * with a calm error line — already-applied days replay as no-ops on
 * retry thanks to the action's own upsert semantics.
 */

import * as React from "react";
import { format } from "date-fns";

import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { LEG_DAY_SUGGEST_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { callAction } from "@/lib/ui/call-action";
import { parseDateOnly } from "@/lib/utils/date-only";
import { setMemberDayAction } from "@/lib/actions/trip-member-days";
import type { LegDaySuggestions } from "@/lib/utils/leg-day-suggestions";

export interface LegDaySuggestPromptProps {
  tripId: string;
  suggestions: LegDaySuggestions;
  /** Called when the prompt resolves (applied or dismissed). */
  onDone: (applied: boolean) => void;
}

/** Day-header register (#211): lowercase `eee d` — "fri 14". */
function dayLabel(iso: string): string {
  return format(parseDateOnly(iso), "eee d").toLowerCase();
}

/** "fri 14" for a single day, "fri 14 – tue 18" for a span. */
function rangeLabel(days: ReadonlyArray<{ date: string }>): string {
  const first = dayLabel(days[0].date);
  const last = dayLabel(days[days.length - 1].date);
  return first === last ? first : `${first} – ${last}`;
}

export function LegDaySuggestPrompt({
  tripId,
  suggestions,
  onDone,
}: LegDaySuggestPromptProps) {
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isApplying, setIsApplying] = React.useState(false);

  const isInbound = suggestions.kind === "inbound";
  const line = (
    isInbound
      ? LEG_DAY_SUGGEST_UI_STRINGS.legDaySuggest_inbound_template
      : LEG_DAY_SUGGEST_UI_STRINGS.legDaySuggest_outbound_template
  )
    .replace("{day}", dayLabel(suggestions.legDayIso))
    .replace("{range}", rangeLabel(suggestions.days));

  const handleApply = async () => {
    setErrorKey(null);
    setIsApplying(true);

    // Sequential on purpose: tiny count (≤ trip length), and the
    // setMemberDay rate-limit scope (30/60s) prefers a quiet drip over
    // a burst. First failure stops the run — the survivor days replay
    // as no-ops when the member retries.
    for (const day of suggestions.days) {
      const idempotencyKey = crypto.randomUUID();
      const result = await callAction(() =>
        setMemberDayAction(
          { tripId, date: day.date, status: day.status },
          idempotencyKey
        )
      );
      if (!result.ok) {
        setErrorKey(result.errorKey);
        setIsApplying(false);
        return;
      }
    }

    setIsApplying(false);
    onDone(true);
  };

  return (
    <div className="border-border bg-card flex flex-col gap-3 rounded-md border px-4 py-3">
      <p className="text-foreground text-sm">{line}</p>
      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
          {ERRORS[errorKey]}
        </p>
      ) : null}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleApply}
          disabled={isApplying}
          className={cn(
            "focus-visible:ring-ring h-9 rounded-xs bg-primary px-4 text-sm font-medium text-primary-foreground",
            "hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          {isInbound
            ? LEG_DAY_SUGGEST_UI_STRINGS.legDaySuggest_apply_inbound
            : LEG_DAY_SUGGEST_UI_STRINGS.legDaySuggest_apply_outbound}
        </button>
        <button
          type="button"
          onClick={() => onDone(false)}
          disabled={isApplying}
          className={cn(
            "focus-visible:ring-ring h-9 rounded-xs border border-border bg-muted px-4 text-sm font-medium text-muted-foreground",
            "hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          {LEG_DAY_SUGGEST_UI_STRINGS.legDaySuggest_dismiss}
        </button>
      </div>
    </div>
  );
}
