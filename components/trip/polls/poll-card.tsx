"use client";

/**
 * PollCard (#390) — one decision poll: question, 2–4 tap-to-vote
 * options with aggregate counts, own choice highlighted, closed state
 * shows the outcome plainly.
 *
 * Aggregate-only hard rule: counts, never voter names.
 *
 * Optimistic UI mirrors the date-poll member card: a transient pending
 * override wins over `view.my_option_id` while the action is in
 * flight; on success we keep it AND call `onMutated` (PulsePoll's
 * `refetch`, F2/#400) so the voter's own tally updates without
 * depending on the Realtime channel. On failure we roll back and
 * surface an inline alert.
 */

import * as React from "react";
import { format, parseISO } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { M5_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { castPollVoteAction } from "@/lib/actions/polls";
import { isPollClosed, leadingOptions } from "@/lib/db/polls";
import type { PollOptionView, PollView } from "@/lib/db/types";

interface PollCardProps {
  view: PollView;
  /** False for viewers without a member row — read-only rows. */
  canVote: boolean;
  /** F2/#400: PulsePoll's `refetch`, called after a successful vote. */
  onMutated?: () => void;
}

export function PollCard({ view, canVote, onMutated }: PollCardProps) {
  const [pendingOption, setPendingOption] = React.useState<string | null>(
    null
  );
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const myOptionId = pendingOption ?? view.my_option_id;
  // Client-local "today" (date-only register). The server + RLS enforce
  // the real deadline; this only picks the rendering.
  const closed = isPollClosed(view.poll.closes_on, format(new Date(), "yyyy-MM-dd"));

  const handleVote = React.useCallback(
    (optionId: string) => {
      if (myOptionId === optionId) return;
      setPendingOption(optionId);
      setErrorKey(null);
      // Key generated at tap time — drunk-double-tap safety (rule 9).
      const idempotencyKey = crypto.randomUUID();
      startTransition(async () => {
        try {
          const result = await castPollVoteAction(
            { pollId: view.poll.id, optionId },
            idempotencyKey
          );
          if (!result.ok) {
            setPendingOption(null);
            setErrorKey(result.errorKey);
            return;
          }
          // Keep the override until the refetch lands the new my_option_id.
          onMutated?.();
        } catch (err) {
          console.error("[polls] castPollVote threw:", err);
          setPendingOption(null);
          setErrorKey("network");
        }
      });
    },
    [myOptionId, view.poll.id, onMutated]
  );

  const interactive = canVote && !closed;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{view.poll.question}</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          {closed ? (
            <Badge variant="secondary">{M5_UI_STRINGS.polls_closed_label}</Badge>
          ) : view.poll.closes_on ? (
            <p className="text-muted-foreground text-xs">
              {M5_UI_STRINGS.polls_closes_template.replace(
                "{date}",
                format(parseISO(view.poll.closes_on), "MMM d")
              )}
            </p>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-2" role={interactive ? "group" : undefined}>
          {view.options.map((optionView) => (
            <li key={optionView.option.id}>
              <OptionRow
                optionView={optionView}
                isMine={optionView.option.id === myOptionId}
                interactive={interactive}
                disabled={isPending}
                onVote={handleVote}
              />
            </li>
          ))}
        </ul>

        <p className="text-muted-foreground text-xs">{totalLine(view)}</p>

        {closed ? (
          <p className="text-sm font-medium">{outcomeLine(view)}</p>
        ) : null}

        {errorKey ? (
          <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
            {ERRORS[errorKey]}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function totalLine(view: PollView): string {
  if (view.total_votes === 1) return M5_UI_STRINGS.polls_vote_count_one;
  return M5_UI_STRINGS.polls_vote_count_other.replace(
    "{count}",
    String(view.total_votes)
  );
}

/** Closed-state outcome, stated plainly: winner, tie, or nobody voted. */
function outcomeLine(view: PollView): string {
  const leaders = leadingOptions(view);
  if (leaders.length === 0) return M5_UI_STRINGS.polls_closed_no_votes;
  if (leaders.length > 1) return M5_UI_STRINGS.polls_closed_tie;
  return M5_UI_STRINGS.polls_closed_winner_template.replace(
    "{label}",
    (leaders[0] as PollOptionView).option.label
  );
}

function OptionRow({
  optionView,
  isMine,
  interactive,
  disabled,
  onVote,
}: {
  optionView: PollOptionView;
  isMine: boolean;
  interactive: boolean;
  disabled: boolean;
  onVote: (optionId: string) => void;
}) {
  const { option, votes } = optionView;

  if (!interactive) {
    // Read-only row (closed poll, or viewer without a member seat).
    return (
      <div
        className={cn(
          "border-border flex items-center justify-between rounded-xs border px-3 py-2 text-sm",
          isMine ? "border-primary" : undefined
        )}
      >
        <span>{option.label}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {votes}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={isMine}
      aria-label={M5_UI_STRINGS.polls_option_vote_aria_template.replace(
        "{label}",
        option.label
      )}
      disabled={disabled}
      onClick={() => onVote(option.id)}
      className={cn(
        // Full-width tap row, 2px hairline radius (buttons are never
        // pill — design-system radius rule). Hit target ≥44px.
        "focus-visible:ring-ring flex min-h-11 w-full items-center justify-between rounded-xs border px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        isMine
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-muted text-muted-foreground hover:bg-muted/80"
      )}
    >
      <span>{option.label}</span>
      <span className="text-xs tabular-nums">{votes}</span>
    </button>
  );
}
