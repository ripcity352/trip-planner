/**
 * ExpenseCard — one logged spend (#372). Server-renderable; no client
 * state. Visibility badges mirror AnnouncementCard's mapping. The
 * "your share" line renders only when the viewer is actually in the
 * split (rule 8 — no assumed participation).
 */

import { format } from "date-fns";

import { cn } from "@/lib/utils";
import { formatCents } from "@/lib/utils/format-cents";
import { parseDateOnly } from "@/lib/utils/date-only";
import { M3_UI_STRINGS, M5_UI_STRINGS } from "@/lib/copy/empty-states";
import type { Expense, ExpenseSplit } from "@/lib/db/types";

export interface ExpenseCardProps {
  expense: Expense;
  /** Splits for THIS expense only. */
  splits: ExpenseSplit[];
  /** Resolved display name of the payer. */
  payerName: string;
  /** Viewer's trip_members.id — null when somehow unresolved. */
  viewerMemberId: string | null;
  className?: string;
}

const VISIBILITY_BADGE: Partial<Record<Expense["visibility"], string>> = {
  organizers_only: M3_UI_STRINGS.announcements_badge_organizers_only,
  hide_from_celebrant: M3_UI_STRINGS.announcements_badge_hide_celebrant,
  custom: M3_UI_STRINGS.announcements_badge_custom,
};

export function ExpenseCard({
  expense,
  splits,
  payerName,
  viewerMemberId,
  className,
}: ExpenseCardProps) {
  const myShare = viewerMemberId
    ? (splits.find((s) => s.trip_member_id === viewerMemberId) ?? null)
    : null;
  const badge = VISIBILITY_BADGE[expense.visibility];

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
          <p className="text-muted-foreground mt-0.5 text-xs">
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
    </article>
  );
}
