/**
 * ExpenseCard — one logged spend (#372). Server-renderable; no client
 * state. Visibility badges mirror AnnouncementCard's mapping. The
 * "your share" line renders only when the viewer is actually in the
 * split (rule 8 — no assumed participation).
 *
 * #467 — split membership used to be legible only from the payer's
 * edit sheet. The "who's in" line surfaces it for every viewer: names
 * (via `memberMap`) with "you" first when the viewer is included, a
 * quiet not-in-this-one state when they aren't. Single-member splits
 * omit the line — there's nothing to disclose beyond the payer line
 * already shown.
 */

import { format } from "date-fns";

import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/utils/format-cents";
import { parseDateOnly } from "@/lib/utils/date-only";
import { M3_UI_STRINGS, M5_UI_STRINGS } from "@/lib/copy/empty-states";
import { hideFromCelebrantBadge } from "@/lib/utils/celebrant-badge";
import { resolveMemberName } from "@/lib/utils/member-display";
import type { Expense, ExpenseSplit } from "@/lib/db/types";

/** Name entries shown inline before eliding into "+N more" (#467). */
const MAX_SPLIT_NAMES_SHOWN = 4;

export interface ExpenseCardProps {
  expense: Expense;
  /** Splits for THIS expense only. */
  splits: ExpenseSplit[];
  /** Resolved display name of the payer. */
  payerName: string;
  /** Viewer's trip_members.id — null when somehow unresolved. */
  viewerMemberId: string | null;
  /**
   * #405-B — the trip celebrant's display name, threaded from the page so
   * the `hide_from_celebrant` badge names them instead of the generic
   * "Hidden from the celebrant".
   */
  celebrantName?: string | null;
  /**
   * #467 — trip_member.id -> display_name, so the card can resolve split
   * member names for the "who's in" line for every viewer, not just the
   * payer/organizer editing sheet. Same shape the page already builds
   * for `payerName`. Optional so existing single-member-focused tests
   * (payer line, badges) don't need to thread it in.
   */
  memberMap?: ReadonlyMap<string, { display_name: string | null }>;
  className?: string;
}

/**
 * Builds the "who's in" name list for a split the viewer is part of:
 * "you" first, then the rest in split order, elided past
 * MAX_SPLIT_NAMES_SHOWN. Returns null when the viewer isn't in the split
 * (caller renders the quiet not-in-this-one state instead) or when
 * there's nothing split-worthy to say (fewer than 2 people on the tab).
 */
function buildWhosInLine(
  splits: ExpenseSplit[],
  viewerMemberId: string | null,
  memberMap: ReadonlyMap<string, { display_name: string | null }>
): { line: string; viewerIncluded: boolean } | null {
  if (splits.length < 2 || !viewerMemberId) {
    return null;
  }

  const viewerIncluded = splits.some(
    (s) => s.trip_member_id === viewerMemberId
  );

  if (!viewerIncluded) {
    return {
      line: M5_UI_STRINGS.expenses_split_not_in_this_one,
      viewerIncluded: false,
    };
  }

  const otherNames = splits
    .filter((s) => s.trip_member_id !== viewerMemberId)
    .map((s) => resolveMemberName(memberMap, s.trip_member_id));
  const names = [M5_UI_STRINGS.expenses_split_you_label, ...otherNames];
  const shown = names.slice(0, MAX_SPLIT_NAMES_SHOWN);
  const remaining = names.length - shown.length;

  const namesLabel =
    remaining > 0
      ? `${shown.join(", ")} ${M5_UI_STRINGS.expenses_split_more_template.replace(
          "{count}",
          String(remaining)
        )}`
      : shown.join(", ");

  const line = M5_UI_STRINGS.expenses_split_ways_template
    .replace("{count}", String(splits.length))
    .replace("{names}", namesLabel);

  return { line, viewerIncluded: true };
}

/**
 * Non-celebrant visibility badges. `hide_from_celebrant` is NOT here — it
 * goes through `hideFromCelebrantBadge` so it can name the celebrant (#405-B).
 */
const VISIBILITY_BADGE: Partial<Record<Expense["visibility"], string>> = {
  organizers_only: M3_UI_STRINGS.announcements_badge_organizers_only,
  custom: M3_UI_STRINGS.announcements_badge_custom,
};

export function ExpenseCard({
  expense,
  splits,
  payerName,
  viewerMemberId,
  celebrantName,
  memberMap = new Map(),
  className,
}: ExpenseCardProps) {
  const myShare = viewerMemberId
    ? (splits.find((s) => s.trip_member_id === viewerMemberId) ?? null)
    : null;
  const badge =
    expense.visibility === "hide_from_celebrant"
      ? hideFromCelebrantBadge(celebrantName)
      : VISIBILITY_BADGE[expense.visibility];
  const whosIn = buildWhosInLine(splits, viewerMemberId, memberMap);

  return (
    <article
      className={cn(
        "rounded-sm border border-border bg-card p-4 text-card-foreground",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">
            {expense.description}
          </h3>
          <p className="text-muted-foreground mt-0.5 truncate text-xs">
            {M5_UI_STRINGS.expenses_paid_by_template.replace(
              "{name}",
              payerName
            )}
            {" · "}
            {format(parseDateOnly(expense.occurred_on), "MMM d")}
          </p>
        </div>
        <p className="shrink-0 text-sm font-semibold tabular-nums">
          {formatCents(expense.amount_cents, expense.currency)}
        </p>
      </div>

      {badge ? (
        <span className="text-muted-foreground mt-2 inline-block rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs">
          {badge}
        </span>
      ) : null}

      {myShare ? (
        <p className="mt-2 text-xs font-medium">
          {M5_UI_STRINGS.expenses_your_share_label}
          {": "}
          <span className="tabular-nums">
            {formatCents(myShare.amount_cents, myShare.currency)}
          </span>
        </p>
      ) : null}

      {whosIn ? (
        <p
          className={cn(
            "text-muted-foreground mt-1 min-w-0 truncate text-xs",
            !whosIn.viewerIncluded && "italic"
          )}
        >
          {whosIn.line}
        </p>
      ) : null}
    </article>
  );
}
