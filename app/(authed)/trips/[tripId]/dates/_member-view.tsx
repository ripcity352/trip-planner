"use client";

/**
 * Member slice of the date-poll page. Renders the candidate list
 * (with vetoed candidates pre-filtered upstream), per-candidate
 * vote chips, aggregate yes/no counts, and a celebrant badge
 * (e.g. "could work for the celebrant") when the mark is
 * `works-with-effort` or `null`.
 *
 * Optimistic UI: clicking a vote chip flips local state immediately
 * and queues the server action. On success we keep the optimistic
 * value AND call `onMutated` (PulsePoll's `refetch`, F2/#400) so the
 * voter's own aggregate tally updates without depending on the
 * Realtime channel — mirroring `_celebrant-view.tsx`. On failure we
 * roll back and surface an inline alert. If the realtime channel is
 * `isStale` the parent renders a small "syncing…" badge — passed in
 * here.
 */

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { M2_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { castDateVoteAction } from "@/lib/actions/date-poll";
import type { DatePollCandidateView } from "@/lib/db/types";

import { formatDateRange } from "./_format";
import { LockInButton } from "./_lock-in-button";
import { DeleteCandidateButton } from "./_delete-candidate-button";

interface MemberViewProps {
  candidates: ReadonlyArray<DatePollCandidateView>;
  /**
   * #369: organizer-only "Lock it in" affordance per candidate. False
   * for plain members and (non-organizer) celebrants — rule 11.
   */
  canLock?: boolean;
  /**
   * #369: whether the viewer can actually propose a window (the
   * add-window form renders for them). Drives the empty-state copy so
   * "drop one and we'll start voting" never dangles for someone with no
   * add affordance.
   */
  canPropose?: boolean;
  /** F2/#400: PulsePoll's `refetch`, called after a successful vote. */
  onMutated?: () => void;
}

export function MemberView({
  candidates,
  canLock = false,
  canPropose = false,
  onMutated,
}: MemberViewProps) {
  if (candidates.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {canPropose
          ? M2_UI_STRINGS.datePoll_no_candidates_yet
          : M2_UI_STRINGS.datePoll_no_candidates_member}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {candidates.map((row) => (
        <li key={row.candidate.id}>
          <CandidateMemberCard
            row={row}
            canLock={canLock}
            onMutated={onMutated}
          />
        </li>
      ))}
    </ul>
  );
}

function CandidateMemberCard({
  row,
  canLock,
  onMutated,
}: {
  row: DatePollCandidateView;
  canLock: boolean;
  onMutated?: () => void;
}) {
  // Optimistic vote pattern: keep a transient "pending override" that
  // wins over `row.my_vote` while the server action is in flight or
  // after a failure. Once the parent's PulsePoll refetch lands a new
  // row.my_vote matching the override, the override naturally becomes
  // redundant — we clear it on success-confirm via the action result.
  //
  // This avoids the synchronous-setState-in-effect anti-pattern: the
  // displayed vote is computed from props + state, not synced via
  // useEffect.
  const [pendingVote, setPendingVote] = React.useState<boolean | null>(
    null
  );
  const displayVote = pendingVote ?? row.my_vote;

  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const handleVote = React.useCallback(
    (vote: boolean) => {
      if (displayVote === vote) return;
      setPendingVote(vote);
      setErrorKey(null);
      const idempotencyKey = crypto.randomUUID();
      startTransition(async () => {
        try {
          const result = await castDateVoteAction(
            { candidateId: row.candidate.id, vote },
            idempotencyKey
          );
          if (!result.ok) {
            // Roll back — display falls back to row.my_vote.
            setPendingVote(null);
            setErrorKey(result.errorKey);
            return;
          }
          // Success: keep the override until PulsePoll refetches.
          // The parent will re-render us with row.my_vote = vote;
          // the override remains harmless until cleared by the next
          // distinct user click. (Drift between override and props
          // is fine because both encode the same vote.)
          //
          // F2/#400: pull a fresh copy now — don't wait on the
          // Realtime channel. This is what moves the voter's own
          // yes/no tally; a `postgres_changes` event for the same
          // write may also fire and trigger a second (idempotent)
          // refetch.
          onMutated?.();
        } catch (err) {
          console.error("[date-poll] castDateVote threw:", err);
          setPendingVote(null);
          setErrorKey("network");
        }
      });
    },
    [displayVote, row.candidate.id, onMutated]
  );

  // #482: the celebrant's positive "Works" verdict rendered no badge —
  // indistinguishable from a window nobody had weighed in on yet.
  const isWorks = row.mark === "works";
  const isEffortFlag = row.mark === "works-with-effort";
  const isUnmarked = row.mark === null;
  const dateRangeLabel = formatDateRange(
    row.candidate.starts_on,
    row.candidate.ends_on
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{row.candidate.label}</CardTitle>
        <p className="text-muted-foreground text-sm">{dateRangeLabel}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {isWorks ? (
            <Badge variant="secondary">
              {M2_UI_STRINGS.datePoll_celebrant_works_badge}
            </Badge>
          ) : null}
          {isEffortFlag ? (
            <Badge variant="secondary">
              {M2_UI_STRINGS.datePoll_celebrant_effort_badge}
            </Badge>
          ) : null}
          {isUnmarked ? (
            <Badge variant="outline">
              {M2_UI_STRINGS.datePoll_celebrant_unmarked_badge}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div
          role="group"
          aria-label={M2_UI_STRINGS.datePoll_vote_aria_label_template.replace(
            "{label}",
            row.candidate.label
          )}
          className="flex flex-wrap items-center gap-2"
        >
          <VoteChip
            label={M2_UI_STRINGS.datePoll_member_vote_yes}
            active={displayVote === true}
            onClick={() => handleVote(true)}
            disabled={isPending}
          />
          <VoteChip
            label={M2_UI_STRINGS.datePoll_member_vote_no}
            active={displayVote === false}
            onClick={() => handleVote(false)}
            disabled={isPending}
          />
        </div>
        <p className="text-muted-foreground text-xs">
          {M2_UI_STRINGS.datePoll_vote_counts_template
            .replace("{yes}", String(row.yes_votes))
            .replace("{no}", String(row.no_votes))}
        </p>
        {errorKey ? (
          <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
            {ERRORS[errorKey]}
          </p>
        ) : null}
        {canLock ? (
          <LockInButton
            candidateId={row.candidate.id}
            dateRangeLabel={dateRangeLabel}
          />
        ) : null}
        {/* #481: delete shares the lock-in's organizer gate — both are
            "candidates: organizers can ..." RLS policies. */}
        {canLock ? (
          <DeleteCandidateButton
            candidateId={row.candidate.id}
            candidateLabel={row.candidate.label}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

interface VoteChipProps {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled: boolean;
}

function VoteChip({ label, active, onClick, disabled }: VoteChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        // Hit-slop (#F4): 36px visual -> 44px effective, y-only. Chips sit
        // in a gap-2 (8px) row — x-slop would overlap the neighboring chip.
        "focus-visible:ring-ring relative inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors after:absolute after:-inset-y-1 after:content-[''] focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-muted text-muted-foreground hover:bg-muted/80"
      )}
    >
      {label}
    </button>
  );
}
