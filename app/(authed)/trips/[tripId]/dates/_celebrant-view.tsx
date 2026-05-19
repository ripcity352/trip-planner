"use client";

/**
 * Celebrant slice of the date-poll page. Renders the celebrant's
 * marks UI: a 3-state chip group per candidate. Marking a candidate
 * `no-go` fades it (still visible to the celebrant; hidden from
 * members).
 *
 * Optimistic UI: clicking a chip lands immediately; the realtime
 * channel (owned by the parent `<PulsePoll>`) refetches and replaces
 * state, so we do NOT mutate local state — server is authoritative.
 * If the action fails we surface a small inline alert.
 */

import * as React from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { M2_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { setCelebrantMarkAction } from "@/lib/actions/date-poll";
import type {
  DatePollCandidateView,
  DatePollCelebrantMark,
} from "@/lib/db/types";

import { formatDateRange } from "./_format";

interface CelebrantViewProps {
  candidates: ReadonlyArray<DatePollCandidateView>;
}

type ChipDef = {
  mark: DatePollCelebrantMark;
  label: string;
};

const CHIPS: ReadonlyArray<ChipDef> = [
  { mark: "works", label: M2_UI_STRINGS.datePoll_celebrant_chip_works },
  {
    mark: "works-with-effort",
    label: M2_UI_STRINGS.datePoll_celebrant_chip_works_with_effort,
  },
  { mark: "no-go", label: M2_UI_STRINGS.datePoll_celebrant_chip_no_go },
];

export function CelebrantView({ candidates }: CelebrantViewProps) {
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
          <CandidateCelebrantCard row={row} />
        </li>
      ))}
    </ul>
  );
}

function CandidateCelebrantCard({ row }: { row: DatePollCandidateView }) {
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const handleSet = React.useCallback(
    (mark: DatePollCelebrantMark) => {
      if (row.mark === mark) return;
      setErrorKey(null);
      const idempotencyKey = crypto.randomUUID();
      startTransition(async () => {
        try {
          const result = await setCelebrantMarkAction(
            { candidateId: row.candidate.id, mark },
            idempotencyKey
          );
          if (!result.ok) {
            setErrorKey(result.errorKey);
          }
          // On success we do nothing — the realtime channel will
          // refetch and the new mark will land via the parent.
        } catch (err) {
          console.error("[date-poll] setCelebrantMark threw:", err);
          setErrorKey("network");
        }
      });
    },
    [row.candidate.id, row.mark]
  );

  const isVetoed = row.mark === "no-go";

  return (
    <Card className={cn(isVetoed && "opacity-60")}>
      <CardHeader>
        <CardTitle className="text-base">{row.candidate.label}</CardTitle>
        <p className="text-muted-foreground text-sm">
          {formatDateRange(row.candidate.starts_on, row.candidate.ends_on)}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div
          role="group"
          aria-label={`Mark for ${row.candidate.label}`}
          className="flex flex-wrap items-center gap-2"
        >
          {CHIPS.map((chip) => {
            const isActive = row.mark === chip.mark;
            return (
              <button
                key={chip.mark}
                type="button"
                aria-pressed={isActive}
                disabled={isPending}
                onClick={() => handleSet(chip.mark)}
                className={cn(
                  "focus-visible:ring-ring inline-flex h-9 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
                  isActive
                    ? chip.mark === "no-go"
                      ? "border-destructive bg-destructive/10 text-destructive"
                      : "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-muted text-muted-foreground hover:bg-muted/80"
                )}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
        {/* Aggregate count remains visible to celebrant — they earn the
            see-all view explicitly. */}
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
