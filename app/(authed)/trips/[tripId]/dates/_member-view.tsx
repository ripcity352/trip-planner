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
 * value (realtime will refresh anyway). On failure we roll back
 * and surface an inline alert. If the realtime channel is `isStale`
 * the parent renders a small "syncing…" badge — passed in here.
 */

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { M2_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { castDateVoteAction } from "@/lib/actions/date-poll";
import type { DatePollCandidateView } from "@/lib/db/types";

import { formatDateRange } from "./_format";

interface MemberViewProps {
  candidates: ReadonlyArray<DatePollCandidateView>;
}

export function MemberView({ candidates }: MemberViewProps) {
  if (candidates.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {M2_UI_STRINGS.datePoll_no_candidates_yet}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {candidates.map((row) => (
        <li key={row.candidate.id}>
          <CandidateMemberCard row={row} />
        </li>
      ))}
    </ul>
  );
}

function CandidateMemberCard({ row }: { row: DatePollCandidateView }) {
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
        } catch (err) {
          console.error("[date-poll] castDateVote threw:", err);
          setPendingVote(null);
          setErrorKey("network");
        }
      });
    },
    [displayVote, row.candidate.id]
  );

  const isEffortFlag = row.mark === "works-with-effort";
  const isUnmarked = row.mark === null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{row.candidate.label}</CardTitle>
        <p className="text-muted-foreground text-sm">
          {formatDateRange(row.candidate.starts_on, row.candidate.ends_on)}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
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
          aria-label={`Vote on ${row.candidate.label}`}
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
          {row.yes_votes} yes · {row.no_votes} no
        </p>
        {errorKey ? (
          <p role="alert" className="text-destructive text-sm">
            {ERRORS[errorKey]}
          </p>
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
        "focus-visible:ring-ring inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-muted text-muted-foreground hover:bg-muted/80"
      )}
    >
      {label}
    </button>
  );
}
