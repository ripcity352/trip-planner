"use client";

/**
 * PollCommentComposer — single-line comment composer pinned under a
 * poll's comment thread (#620, part 1/3 of #616). Near-direct clone of
 * `ShoppingNoteComposer` (components/trip/shopping-list/ShoppingNoteComposer.tsx).
 *
 * Idempotency key is PER-LOGICAL-COMMENT, not per mount: `idempotencyKey`
 * is seeded once via a `useState` lazy initializer, REUSED across
 * retries of the same comment (a failed submit keeps the key so a retry
 * replays safely), and ROTATES to a fresh UUID on every CONFIRMED
 * `ok:true`. Rotating only on mount would break a second comment posted
 * in the same session — it would reuse the first comment's key, collide
 * on the unique (poll_id, author_trip_member_id, idempotency_key) index,
 * and the server's 23505 branch would silently re-select the FIRST
 * comment instead of inserting the second (see the action's module
 * header in lib/actions/polls.ts).
 */

import * as React from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { callAction } from "@/lib/ui/call-action";
import { postPollCommentAction } from "@/lib/actions/polls";
import { M5_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import type { PollComment } from "@/lib/db/types";

export interface PollCommentComposerProps {
  pollId: string;
  /** Fired with the server-confirmed comment on a successful post. */
  onSubmitted: (comment: PollComment) => void;
}

export function PollCommentComposer({
  pollId,
  onSubmitted,
}: PollCommentComposerProps) {
  const [body, setBody] = React.useState("");
  const [isPending, setIsPending] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [idempotencyKey, setIdempotencyKey] = React.useState<string>(() =>
    crypto.randomUUID()
  );

  const trimmed = body.trim();
  const canSubmit = trimmed.length > 0 && !isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setErrorKey(null);
    setIsPending(true);
    try {
      const result = await callAction(() =>
        postPollCommentAction({ pollId, body: trimmed }, idempotencyKey)
      );
      if (!result.ok) {
        setErrorKey(result.errorKey);
        return;
      }

      onSubmitted(result.comment);
      setBody("");
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
        <label htmlFor={`poll-comment-body-${pollId}`} className="sr-only">
          {M5_UI_STRINGS.polls_comment_placeholder}
        </label>
        <input
          id={`poll-comment-body-${pollId}`}
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={M5_UI_STRINGS.polls_comment_placeholder}
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
          disabled={!canSubmit}
          aria-busy={isPending}
          aria-label={M5_UI_STRINGS.polls_comment_composer_submit_aria}
        >
          {M5_UI_STRINGS.polls_comment_composer_submit_aria}
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
