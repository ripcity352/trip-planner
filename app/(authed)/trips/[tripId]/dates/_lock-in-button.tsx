"use client";

/**
 * Organizer-only "Lock it in" affordance (#369). Rendered per candidate
 * window inside the poll views. Tapping it calls `lockInCandidateAction`,
 * which writes the candidate's window into `trips.starts_at`/`ends_at`
 * and revalidates `/trips` (F2/#369) — the page's Server Component then
 * re-renders as the decided state, so this button intentionally owns no
 * success UI beyond its pending flag; the whole poll surface is replaced.
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
}

export function LockInButton({ candidateId }: LockInButtonProps) {
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const handleLock = React.useCallback(() => {
    setErrorKey(null);
    startTransition(async () => {
      try {
        const result = await lockInCandidateAction(candidateId);
        if (!result.ok) {
          setErrorKey(result.errorKey);
          return;
        }
        // Success: the action's revalidatePath re-renders the page into
        // the decided state — nothing to update locally.
      } catch (err) {
        console.error("[date-poll] lockInCandidate threw:", err);
        setErrorKey("network");
      }
    });
  }, [candidateId]);

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={isPending}
        onClick={handleLock}
      >
        {M2_UI_STRINGS.datePoll_lock_in_cta}
      </Button>
      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
          {ERRORS[errorKey]}
        </p>
      ) : null}
    </div>
  );
}
