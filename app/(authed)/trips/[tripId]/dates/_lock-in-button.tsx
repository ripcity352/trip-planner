"use client";

/**
 * Organizer-only "Lock it in" affordance (#369). Rendered per candidate
 * window inside the poll views. Tapping it calls `lockInCandidateAction`,
 * which writes the candidate's window into `trips.starts_at`/`ends_at`
 * and revalidates `/trips` (F2/#369) — the page's Server Component then
 * re-renders as the decided state, so this button intentionally owns no
 * success UI beyond its pending flag; the whole poll surface is replaced.
 *
 * #454: #210 two-step confirm. Locking dates writes `trips.starts_at` /
 * `ends_at` for the whole crew and archives the poll — the single most
 * consequential organizer action on this surface, and it shipped with
 * LESS friction than removing one roster member. First tap arms the
 * button and reveals the confirm line + a "Never mind" escape (same
 * idiom as roster remove / celebrant unseat in
 * `components/trip/roster/member-manage.tsx`); a second tap on the
 * same button commits.
 *
 * Rule 11: this is an organizer micro-affordance, never a gate. Members
 * and the celebrant never see it (the caller passes `canLock`); the
 * celebrant just sees the poll they already know, then the decided
 * window when it lands.
 */

import * as React from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { M2_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { lockInCandidateAction } from "@/lib/actions/date-poll";

interface LockInButtonProps {
  candidateId: string;
  /** Formatted date range, e.g. "Aug 1 – Aug 4, 2026" — named in the
   * #210 confirm copy so the crew-wide consequence is unambiguous. */
  dateRangeLabel: string;
}

export function LockInButton({
  candidateId,
  dateRangeLabel,
}: LockInButtonProps) {
  const [armed, setArmed] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const handleLock = React.useCallback(() => {
    // #454: first tap arms, second tap (same button) commits.
    if (!armed) {
      setArmed(true);
      setErrorKey(null);
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      try {
        const result = await lockInCandidateAction(candidateId);
        if (!result.ok) {
          setErrorKey(result.errorKey);
          setArmed(false);
          return;
        }
        // Success: the action's revalidatePath re-renders the page into
        // the decided state — nothing to update locally.
      } catch (err) {
        console.error("[date-poll] lockInCandidate threw:", err);
        setErrorKey("network");
        setArmed(false);
      }
    });
  }, [armed, candidateId]);

  const handleNeverMind = React.useCallback(() => {
    setArmed(false);
    setErrorKey(null);
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={handleLock}
          className={cn(armed && "border-foreground/40 bg-muted/80")}
        >
          {M2_UI_STRINGS.datePoll_lock_in_cta}
        </Button>
        {armed ? (
          <button
            type="button"
            onClick={handleNeverMind}
            disabled={isPending}
            className={cn(
              "focus-visible:ring-ring rounded-xs px-3 py-1.5 text-xs font-medium text-muted-foreground",
              "hover:bg-muted focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-60"
            )}
          >
            {M2_UI_STRINGS.datePoll_lock_in_never_mind}
          </button>
        ) : null}
      </div>
      {armed ? (
        <p className="text-xs font-medium">
          {M2_UI_STRINGS.datePoll_lock_in_confirm_template.replace(
            "{dates}",
            dateRangeLabel
          )}
        </p>
      ) : null}
      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
          {ERRORS[errorKey]}
        </p>
      ) : null}
    </div>
  );
}
