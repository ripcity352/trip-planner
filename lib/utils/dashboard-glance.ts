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
import type { ArrivalInstant } from "@/lib/db/travel-legs";

export interface ArrivalsGlance {
  /** Distinct MEMBERS with at least one arrival at or before `now`. */
  landed: number;
  /**
   * Earliest future arrival among members who have NOT yet landed at
   * all, or null when none remain. Members are the unit, not legs:
   * a connecting second leg or a logged return trip of someone who
   * already landed never shows up as "next".
   */
  nextArrival: Date | null;
}

/**
 * Summarize arrival instants for the dashboard Arrivals card.
 * `arrivals` is the slim `getArrivalTimesByTrip` read — member id +
 * ISO timestamp, nulls already filtered out at the DB layer. Order is
 * not assumed. Legs are per-leg (connections, return trips), so the
 * math groups by member: a person has "landed" once any of their
 * arrivals is in the past.
 */
export function summarizeArrivals(
  arrivals: readonly ArrivalInstant[],
  now: Date
): ArrivalsGlance {
  const nowMs = now.getTime();

  const byMember = arrivals.reduce<
    ReadonlyMap<string, { hasLanded: boolean; earliestFutureMs: number | null }>
  >((acc, { trip_member_id, arrive_at }) => {
    const atMs = new Date(arrive_at).getTime();
    const prev = acc.get(trip_member_id) ?? {
      hasLanded: false,
      earliestFutureMs: null,
    };
    const entry =
      atMs <= nowMs
        ? { ...prev, hasLanded: true }
        : {
            ...prev,
            earliestFutureMs:
              prev.earliestFutureMs === null || atMs < prev.earliestFutureMs
                ? atMs
                : prev.earliestFutureMs,
          };
    return new Map(acc).set(trip_member_id, entry);
  }, new Map());

  let landed = 0;
  let nextMs: number | null = null;
  for (const entry of byMember.values()) {
    if (entry.hasLanded) {
      landed += 1;
    } else if (
      entry.earliestFutureMs !== null &&
      (nextMs === null || entry.earliestFutureMs < nextMs)
    ) {
      nextMs = entry.earliestFutureMs;
    }
  }

  return { landed, nextArrival: nextMs === null ? null : new Date(nextMs) };
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
