"use client";

/**
 * PollWriteInComposer — quiet "add your own option" affordance under a
 * poll's option list (#621, part 2/3 of #616). Near-direct clone of
 * `PollCommentComposer`'s idempotency-key lifecycle: seeded once via a
 * lazy `useState` initializer, REUSED across retries of the same
 * submission (a failed add keeps the key so a retry replays safely),
 * and ROTATES to a fresh UUID only after a confirmed `ok:true` — see
 * that file's header for why rotating on every mount would break a
 * second write-in in the same session.
 *
 * Mounted only when the poll is OPEN and the viewer has a seat
 * (PollCard gates both) — a closed poll or a read-only viewer never
 * sees this input at all (rule 11 — no disabled control, no
 * "you can't do this" message, the affordance simply isn't there).
 */

import * as React from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { callAction } from "@/lib/ui/call-action";
import { addPollOptionAction } from "@/lib/actions/polls";
import { M5_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";

export interface PollWriteInComposerProps {
  pollId: string;
  /** Fired after a server-confirmed add so the caller can refetch
   * (F2/#400 — never relies solely on the Realtime channel). */
  onAdded: () => void;
}

export function PollWriteInComposer({
  pollId,
  onAdded,
}: PollWriteInComposerProps) {
  const [label, setLabel] = React.useState("");
  const [isPending, setIsPending] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [idempotencyKey, setIdempotencyKey] = React.useState<string>(() =>
    crypto.randomUUID()
  );

  const trimmed = label.trim();
  const canSubmit = trimmed.length > 0 && !isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setErrorKey(null);
    setIsPending(true);
    try {
      const result = await callAction(() =>
        addPollOptionAction({ pollId, label: trimmed }, idempotencyKey)
      );
      if (!result.ok) {
        setErrorKey(result.errorKey);
        return;
      }

      onAdded();
      setLabel("");
      // Rotate ONLY after a confirmed ok:true — see module header. A
      // retry of a FAILED submit reuses the same key on its next attempt.
      setIdempotencyKey(crypto.randomUUID());
    } finally {
      setIsPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <label htmlFor={`poll-writein-${pollId}`} className="sr-only">
          {M5_UI_STRINGS.polls_writein_placeholder}
        </label>
        <input
          id={`poll-writein-${pollId}`}
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={M5_UI_STRINGS.polls_writein_placeholder}
          maxLength={80}
          disabled={isPending}
          className={cn(
            "w-full flex-1 rounded-xs border border-border bg-background px-3 py-2 text-sm",
            "placeholder:text-muted-foreground",
            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={!canSubmit}
          aria-busy={isPending}
        >
          {M5_UI_STRINGS.polls_writein_add_cta}
        </Button>
      </div>
      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-xs")}>
          {ERRORS[errorKey]}
        </p>
      ) : null}
    </form>
  );
}
