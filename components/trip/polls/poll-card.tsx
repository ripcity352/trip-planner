"use client";

/**
 * PollCard (#390) — one decision poll: question, 2–4 tap-to-vote
 * options with aggregate counts, own choice highlighted, closed state
 * shows the outcome plainly.
 *
 * Aggregate-only hard rule: counts, never voter names.
 *
 * Optimistic UI mirrors the date-poll member card: a transient pending
 * override wins over `view.my_option_ids` while the action is in
 * flight; on success we keep it AND call `onMutated` (PulsePoll's
 * `refetch`, F2/#400) so the voter's own tally updates without
 * depending on the Realtime channel. On failure we roll back and
 * surface an inline alert.
 *
 * #627 — `view.poll.allow_multiple` splits the interaction: a
 * single-choice poll keeps the original tap-to-replace behavior (one
 * pending override, all other rows implicitly deselect); a
 * multi-choice poll renders checkboxes and tracks an independent
 * optimistic override PER option, since any number can be selected at
 * once and each toggle is its own add/remove round-trip.
 */

import * as React from "react";
import { format, parseISO } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { M5_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { castPollVoteAction, retractPollVoteAction } from "@/lib/actions/polls";
import { isPollClosed, leadingOptions } from "@/lib/db/polls";
import { PollCommentThread } from "./poll-comment-thread";
import { PollCommentComposer } from "./poll-comment-composer";
import { PollWriteInComposer } from "./poll-writein-composer";
import type { PollComment, PollOptionView, PollView } from "@/lib/db/types";

interface PollCardProps {
  view: PollView;
  /** False for viewers without a member row — read-only rows. */
  canVote: boolean;
  /** F2/#400: PulsePoll's `refetch`, called after a successful vote. */
  onMutated?: () => void;
  // #620 — poll comments (part 1/3 of #616). Threaded straight from the
  // page's server-side fold (PollsDisclosure → PollsSection), NOT
  // through PulsePoll's `view` — comments refresh via `router.refresh()`
  // inside PollCommentThread (#349), never the Realtime channel.
  /** This poll's comments, pre-enriched (authorDisplayName always set). */
  comments: readonly PollComment[];
  /** The viewer's trip_members.id — undefined hides the composer
   * (no seat to author a comment as). */
  viewerTripMemberId: string | undefined;
  isViewerOrganizer: boolean;
  viewerDisplayName: string | null;
  /** Server-provided reference clock — see PollCommentThread re: hydration. */
  now: Date;
}

export function PollCard({
  view,
  canVote,
  onMutated,
  comments,
  viewerTripMemberId,
  isViewerOrganizer,
  viewerDisplayName,
  now,
}: PollCardProps) {
  // Single-choice: one pending override (the new sole selection) —
  // unchanged from pre-#627 behavior.
  const [pendingOption, setPendingOption] = React.useState<string | null>(
    null
  );
  // Multi-choice: an independent optimistic override PER option,
  // keyed by option id — each toggle is its own add/remove round-trip
  // and other options must not be affected.
  const [multiOverrides, setMultiOverrides] = React.useState<
    Record<string, boolean>
  >({});
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();
  // Optimistic comments appended locally between "submitted" and the
  // next `router.refresh()` reconciling real props (mirrors
  // ShoppingItemSheet's `optimisticComments` — deduped against
  // `comments` by idempotency_key so a refresh never double-renders one).
  const [optimisticComments, setOptimisticComments] = React.useState<
    readonly PollComment[]
  >([]);

  const isMultiChoice = view.poll.allow_multiple;
  const myOptionId = pendingOption ?? (view.my_option_ids[0] ?? null);
  // Client-local "today" (date-only register). The server + RLS enforce
  // the real deadline; this only picks the rendering.
  const closed = isPollClosed(view.poll.closes_on, format(new Date(), "yyyy-MM-dd"));

  const isSelected = React.useCallback(
    (optionId: string): boolean =>
      isMultiChoice
        ? (multiOverrides[optionId] ?? view.my_option_ids.includes(optionId))
        : optionId === myOptionId,
    [isMultiChoice, multiOverrides, myOptionId, view.my_option_ids]
  );

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
          // Keep the override until the refetch lands the new my_option_ids.
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

  const handleToggle = React.useCallback(
    (optionId: string) => {
      const wasSelected = isSelected(optionId);
      const nextSelected = !wasSelected;
      setMultiOverrides((prev) => ({ ...prev, [optionId]: nextSelected }));
      setErrorKey(null);
      const idempotencyKey = crypto.randomUUID();
      startTransition(async () => {
        try {
          const result = nextSelected
            ? await castPollVoteAction(
                { pollId: view.poll.id, optionId },
                idempotencyKey
              )
            : await retractPollVoteAction(
                { pollId: view.poll.id, optionId },
                idempotencyKey
              );
          if (!result.ok) {
            setMultiOverrides((prev) => ({ ...prev, [optionId]: wasSelected }));
            setErrorKey(result.errorKey);
            return;
          }
          onMutated?.();
        } catch (err) {
          console.error("[polls] toggle poll vote threw:", err);
          setMultiOverrides((prev) => ({ ...prev, [optionId]: wasSelected }));
          setErrorKey("network");
        }
      });
    },
    [isSelected, view.poll.id, onMutated]
  );

  const mergedComments = React.useMemo(() => {
    const known = new Set(
      comments
        .map((c) => c.idempotency_key)
        .filter((k): k is string => k != null)
    );
    const stillPending = optimisticComments.filter(
      (c) => c.idempotency_key == null || !known.has(c.idempotency_key)
    );
    return [...comments, ...stillPending];
  }, [comments, optimisticComments]);

  const handleCommentSubmitted = React.useCallback((comment: PollComment) => {
    setOptimisticComments((prev) => [...prev, comment]);
  }, []);

  const handleCommentDeleted = React.useCallback((commentId: string) => {
    setOptimisticComments((prev) => prev.filter((c) => c.id !== commentId));
  }, []);

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
                isMine={isSelected(optionView.option.id)}
                isMultiChoice={isMultiChoice}
                interactive={interactive}
                disabled={isPending}
                onVote={isMultiChoice ? handleToggle : handleVote}
              />
            </li>
          ))}
        </ul>

        {/* #621 — write-in affordance: open poll + a seat to attribute
            it to. No affordance at all for a closed poll or a
            read-only viewer (rule 11 — no disabled control, no
            "you can't" message). */}
        {!closed && viewerTripMemberId !== undefined ? (
          <PollWriteInComposer
            pollId={view.poll.id}
            onAdded={() => onMutated?.()}
          />
        ) : null}

        <p className="text-muted-foreground text-xs">{totalLine(view)}</p>

        {closed ? (
          <p className="text-sm font-medium">{outcomeLine(view)}</p>
        ) : null}

        {errorKey ? (
          <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
            {ERRORS[errorKey]}
          </p>
        ) : null}

        <div className="border-border mt-1 flex flex-col gap-3 border-t pt-3">
          <PollCommentThread
            comments={mergedComments}
            viewerTripMemberId={viewerTripMemberId}
            isViewerOrganizer={isViewerOrganizer}
            viewerDisplayName={viewerDisplayName}
            now={now}
            onDeleted={handleCommentDeleted}
          />
          {viewerTripMemberId !== undefined ? (
            <PollCommentComposer
              pollId={view.poll.id}
              onSubmitted={handleCommentSubmitted}
            />
          ) : null}
        </div>
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
  isMultiChoice,
  interactive,
  disabled,
  onVote,
}: {
  optionView: PollOptionView;
  isMine: boolean;
  /** #627 — a checkbox row (role="checkbox") instead of a toggle
   * button (role="button", aria-pressed) — any number of these can be
   * checked at once, unlike single-choice's mutually-exclusive rows. */
  isMultiChoice: boolean;
  interactive: boolean;
  disabled: boolean;
  onVote: (optionId: string) => void;
}) {
  const { option, votes, suggested_by_display_name: suggestedBy } =
    optionView;
  // #621 — renders ONLY on write-ins (suggested_by_display_name is
  // null for organizer-composed options — see buildPollViews).
  const attribution = suggestedBy
    ? M5_UI_STRINGS.polls_writein_suggested_by_template.replace(
        "{name}",
        suggestedBy
      )
    : null;

  if (!interactive) {
    // Read-only row (closed poll, or viewer without a member seat).
    return (
      <div
        className={cn(
          "border-border flex flex-col gap-0.5 rounded-xs border px-3 py-2 text-sm",
          isMine ? "border-primary" : undefined
        )}
      >
        <div className="flex items-center justify-between">
          <span>{option.label}</span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {votes}
          </span>
        </div>
        {attribution ? (
          <span className="text-muted-foreground text-xs">{attribution}</span>
        ) : null}
      </div>
    );
  }

  const ariaLabel = (
    isMultiChoice
      ? M5_UI_STRINGS.polls_option_select_aria_template
      : M5_UI_STRINGS.polls_option_vote_aria_template
  ).replace("{label}", option.label);

  return (
    <button
      type="button"
      role={isMultiChoice ? "checkbox" : undefined}
      aria-checked={isMultiChoice ? isMine : undefined}
      aria-pressed={isMultiChoice ? undefined : isMine}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onVote(option.id)}
      className={cn(
        // Full-width tap row, 2px hairline radius (buttons are never
        // pill — design-system radius rule). Hit target ≥44px.
        "focus-visible:ring-ring flex min-h-11 w-full flex-col gap-0.5 rounded-xs border px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        isMine
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-muted text-muted-foreground hover:bg-muted/80"
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          {/* #627 — a visible checkbox glyph on multi-choice rows so
              "any number selectable" reads at a glance, distinct from
              single-choice's tap-to-replace rows. */}
          {isMultiChoice ? (
            <span
              aria-hidden="true"
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-xs border text-[10px] leading-none",
                isMine
                  ? "border-primary-foreground bg-primary-foreground text-primary"
                  : "border-current"
              )}
            >
              {isMine ? "✓" : null}
            </span>
          ) : null}
          <span>{option.label}</span>
        </span>
        <span className="text-xs tabular-nums">{votes}</span>
      </span>
      {attribution ? (
        <span
          className={cn(
            "text-xs font-normal",
            isMine ? "text-primary-foreground/80" : "text-muted-foreground"
          )}
        >
          {attribution}
        </span>
      ) : null}
    </button>
  );
}
