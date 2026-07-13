/**
 * Dashboard glance-line computations (glanceability sweep).
 *
 * Pure functions behind the muted one-line context facts on the
 * dashboard link cards. Kept out of the page component so they're
 * unit-testable without a DB, and out of `lib/db/` because they take
 * already-fetched rows (the page batches the reads with Promise.all).
 *
 * Boundaries these helpers respect:
 *   - Arrivals: aggregate landed-count + next arrival instant only —
 *     never names (persona-edge-attendees §4, no arrival forensics).
 *   - Expenses: the VIEWER'S OWN net position only. A group-visible
 *     who-owes-who ledger is killed scope (notes/killed-and-deferred.md)
 *     and must not be reintroduced here.
 */

import type { Expense, ExpenseSplit } from "@/lib/db/types";

export interface ArrivalsGlance {
  /** Legs whose arrival instant is at or before `now`. */
  landed: number;
  /** Earliest arrival strictly after `now`, or null when none remain. */
  nextArrival: Date | null;
}

/**
 * Summarize arrival instants for the dashboard Arrivals card.
 * `arriveTimes` is the slim `getArrivalTimesByTrip` read — ISO
 * timestamps, nulls already filtered out at the DB layer. Order is not
 * assumed.
 */
export function summarizeArrivals(
  arriveTimes: readonly string[],
  now: Date
): ArrivalsGlance {
  return arriveTimes.reduce<ArrivalsGlance>(
    (acc, iso) => {
      const at = new Date(iso);
      if (at.getTime() <= now.getTime()) {
        return { ...acc, landed: acc.landed + 1 };
      }
      const isSooner =
        acc.nextArrival === null || at.getTime() < acc.nextArrival.getTime();
      return isSooner ? { ...acc, nextArrival: at } : acc;
    },
    { landed: 0, nextArrival: null }
  );
}

export interface ViewerNetPosition {
  /**
   * (what the viewer paid) − (the viewer's share of visible expenses),
   * in integer cents. Positive → the viewer has fronted more than
   * their share ("You're up"); negative → the reverse.
   */
  netCents: number;
  /** First visible expense's currency (MVP single-currency heuristic —
   * same rule as the expenses page headline). */
  currency: string;
}

type ExpenseAmount = Pick<Expense, "id" | "payer_id" | "amount_cents" | "currency">;
type SplitAmount = Pick<ExpenseSplit, "expense_id" | "trip_member_id" | "amount_cents">;

/**
 * The viewer's own net position over the expenses THEY can see.
 *
 * `expenses` comes from the RLS-visibility-filtered read; `splits` is
 * member-gated but NOT visibility-gated at the DB (see lib/db/expenses.ts),
 * so split rows are paired against the visible expense list and orphans
 * are dropped — a hidden expense never leaks into the viewer's math.
 *
 * Returns null when there are no visible expenses (callers render the
 * empty-state line instead of a fake "$0.00 even").
 */
export function computeViewerNetPosition(
  expenses: readonly ExpenseAmount[],
  splits: readonly SplitAmount[],
  viewerMemberId: string,
  viewerUserId: string
): ViewerNetPosition | null {
  if (expenses.length === 0) return null;

  const visibleExpenseIds = new Set(expenses.map((e) => e.id));

  const paidCents = expenses.reduce(
    (sum, e) => (e.payer_id === viewerUserId ? sum + e.amount_cents : sum),
    0
  );
  const shareCents = splits.reduce(
    (sum, s) =>
      s.trip_member_id === viewerMemberId && visibleExpenseIds.has(s.expense_id)
        ? sum + s.amount_cents
        : sum,
    0
  );

  return {
    netCents: paidCents - shareCents,
    currency: expenses[0].currency,
  };
}
