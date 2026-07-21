"use client";

/**
 * Organizer-only "Remove" affordance on a candidate window (#481).
 * Quiet by design — a small outlined text control, not a big red
 * button (rule 11: micro-affordance, not an admin panel), matching the
 * register of the roster's "Remove from trip" control in
 * `components/trip/roster/member-manage.tsx`.
 *
 * #210 two-step: first tap arms and reveals the confirm line + a
 * "Never mind" escape; a second tap on the same button commits.
 *
 * Delete semantics (simplest per the DOGE review — no vote-clearing
 * built): the action refuses once the window has any votes and returns
 * `date_candidate_has_votes`, surfaced here as an inline error rather
 * than the UI trying to predict vote state itself.
 */

import * as React from "react";

import { cn } from "@/lib/utils";
import { M2_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { deleteDateCandidateAction } from "@/lib/actions/date-poll";

interface DeleteCandidateButtonProps {
  candidateId: string;
  /** Window label, named in the #210 confirm copy. */
  candidateLabel: string;
}

export function DeleteCandidateButton({
  candidateId,
  candidateLabel,
}: DeleteCandidateButtonProps) {
  const [armed, setArmed] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const handleDelete = React.useCallback(() => {
    if (!armed) {
      setArmed(true);
      setErrorKey(null);
      return;
    }
    setErrorKey(null);
    startTransition(async () => {
      try {
        const result = await deleteDateCandidateAction(candidateId);
        if (!result.ok) {
          setErrorKey(result.errorKey);
          setArmed(false);
          return;
        }
        // Success: the action's revalidatePath re-renders the poll
        // without this candidate — nothing to update locally.
      } catch (err) {
        console.error("[date-poll] deleteDateCandidate threw:", err);
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
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending}
          className={cn(
            "focus-visible:ring-ring rounded-xs border px-3 py-1.5 text-xs font-medium",
            "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60",
            armed
              ? "border-destructive bg-destructive/10 text-destructive"
              : "border-destructive/40 text-destructive hover:bg-destructive/10"
          )}
        >
          {M2_UI_STRINGS.datePoll_delete_cta}
        </button>
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
            {M2_UI_STRINGS.datePoll_delete_never_mind}
          </button>
        ) : null}
      </div>
      {armed ? (
        <p className="text-destructive text-xs font-medium">
          {M2_UI_STRINGS.datePoll_delete_confirm_template.replace(
            "{label}",
            candidateLabel
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
