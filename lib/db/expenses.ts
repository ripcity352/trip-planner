/**
 * Data layer for `expenses` + `expense_splits` (#372, #383, #384).
 *
 * RLS summary (0001_init + m1_foundation +
 * 20260709170000_expenses_update_delete_atomic_rpc):
 *   expenses:
 *     SELECT — `can_see_content(trip_id, visibility)` (visibility-aware:
 *              everyone / organizers_only / hide_from_celebrant / custom)
 *     INSERT — `is_trip_member(trip_id) AND auth.uid() = payer_id`
 *     UPDATE/DELETE — payer-or-organizer (#383)
 *   expense_splits:
 *     SELECT — members of the parent expense's trip
 *     ALL    — payer of the parent expense OR a (co-)organizer
 *
 * Create goes through the `create_expense_with_splits` RPC — SECURITY
 * INVOKER, expense + splits in one transaction, NO INSERT..RETURNING so
 * the SELECT policy never gates creation (#384 layer 1), and an
 * idempotency replay (23505 on `(trip_id, idempotency_key)`) returns
 * the ORIGINAL expense id. The old two-statement torn-write self-heal
 * is gone — the RPC can't tear.
 *
 * Errors surface as `ExpenseDbError` with the Postgres/PostgREST
 * `error.code` preserved: the #384 audit showed the action mapper was
 * grepping message text for "RLS"/"42501" and missing every real
 * failure. Actions map on `.code`, never message text.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Expense, ExpenseSplit } from "./types";

const EXPENSE_COLUMNS =
  "id, trip_id, payer_id, amount_cents, currency, description, occurred_on, created_at, idempotency_key, visibility";

const SPLIT_COLUMNS = "expense_id, trip_member_id, amount_cents, currency";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sentinel `code` for a mutation that matched zero rows — RLS filtered
 * the target (not payer/organizer, or the row is gone). Actions map it
 * like a 42501.
 */
export const EXPENSE_NO_ROW = "expense_no_row";

/** Carries the Postgres error code so actions can map without text-matching. */
export class ExpenseDbError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = "ExpenseDbError";
    this.code = code;
  }
}

/**
 * Expenses for a trip, newest spend first. Visibility filtering happens
 * in RLS (`can_see_content`), so a celebrant never receives a
 * hide_from_celebrant row here — do not re-filter in app code.
 */
export async function getExpensesByTrip(
  supabase: SupabaseClient,
  tripId: string
): Promise<Expense[]> {
  const { data, error } = await supabase
    .from("expenses")
    .select(EXPENSE_COLUMNS)
    .eq("trip_id", tripId)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`getExpensesByTrip failed: ${error.message}`);
  }

  return (data ?? []) as Expense[];
}

/**
 * All split rows for a trip in one query (join-filtered through the
 * parent expense). Split SELECT is member-gated but NOT visibility-
 * gated at the DB layer — pair rows with the visibility-filtered
 * expense list from `getExpensesByTrip` and drop orphans, so a hidden
 * expense's splits never render for a viewer who can't see the parent.
 */
export async function getSplitsByTrip(
  supabase: SupabaseClient,
  tripId: string
): Promise<ExpenseSplit[]> {
  const { data, error } = await supabase
    .from("expense_splits")
    .select(`${SPLIT_COLUMNS}, expenses!inner(trip_id)`)
    .eq("expenses.trip_id", tripId);

  if (error) {
    throw new Error(`getSplitsByTrip failed: ${error.message}`);
  }

  return (data ?? []).map(({ expenses: _join, ...rest }) => rest) as unknown as ExpenseSplit[];
}

export interface CreateExpenseInput {
  trip_id: string;
  /**
   * Kept for signature stability; the RPC writes `auth.uid()` as payer
   * regardless (the INSERT policy requires it), so this can't spoof.
   */
  payer_id: string;
  amount_cents: number;
  description: string;
  /** YYYY-MM-DD; omitted → DB default current_date. */
  occurred_on?: string;
  visibility: Expense["visibility"];
  idempotency_key: string;
}

export interface CreateExpenseSplitInput {
  trip_member_id: string;
  amount_cents: number;
}

/**
 * Create an expense + its splits atomically via the
 * `create_expense_with_splits` RPC (#383). Splits are computed by the
 * caller (`evenSplitCents` sum-exact contract) and written verbatim.
 *
 * The RPC returns the expense id — on an idempotency replay, the
 * ORIGINAL id. The follow-up select is safe: the actions' visibility
 * guard (plus the RPC's own atomicity — an author-unreadable row can
 * never commit) guarantees any id the RPC returns is author-readable.
 */
export async function createExpenseWithSplits(
  supabase: SupabaseClient,
  input: CreateExpenseInput,
  splits: CreateExpenseSplitInput[]
): Promise<Expense> {
  const { data: expenseId, error } = await supabase.rpc(
    "create_expense_with_splits",
    {
      p_trip_id: input.trip_id,
      p_amount_cents: input.amount_cents,
      p_description: input.description,
      p_occurred_on: input.occurred_on ?? null,
      p_visibility: input.visibility,
      p_idempotency_key: input.idempotency_key,
      p_splits: splits,
    }
  );

  if (error) {
    throw new ExpenseDbError(
      `createExpenseWithSplits rpc failed: ${error.message}`,
      error.code ?? null
    );
  }

  const { data, error: selectError } = await supabase
    .from("expenses")
    .select(EXPENSE_COLUMNS)
    .eq("id", expenseId as string)
    .single();

  if (selectError) {
    throw new ExpenseDbError(
      `createExpenseWithSplits readback failed: ${selectError.message}`,
      selectError.code ?? null
    );
  }

  return data as Expense;
}

export interface UpdateExpenseInput {
  expense_id: string;
  amount_cents: number;
  description: string;
  /** YYYY-MM-DD; omitted → leave the stored date unchanged. */
  occurred_on?: string;
  visibility: Expense["visibility"];
  idempotency_key: string;
}

/**
 * Correct an expense (#383): update the row, then rewrite its splits.
 * RLS scopes both to payer-or-organizer.
 *
 * Split rewrite is upsert-then-prune, not delete-then-insert, so a
 * mid-flight failure can leave an extra member briefly — but never a
 * splitless expense inflating the trip total (the #383 orphan class).
 */
export async function updateExpenseWithSplits(
  supabase: SupabaseClient,
  input: UpdateExpenseInput,
  splits: CreateExpenseSplitInput[]
): Promise<void> {
  // The prune step builds a PostgREST filter-grammar string from these
  // ids — re-assert UUID shape at this module boundary BEFORE any write
  // (callers zod-validate, but a future caller skipping that must not
  // be able to widen the filter).
  const memberIds = splits.map((s) => s.trip_member_id);
  if (!memberIds.every((id) => UUID_RE.test(id))) {
    throw new ExpenseDbError(
      "updateExpenseWithSplits: non-uuid trip_member_id in splits",
      null
    );
  }

  // No .select() on the update: RETURNING runs under the SELECT policy
  // and would 42501 on an author-hidden row (#384) — count is enough.
  const { error, count } = await supabase
    .from("expenses")
    .update(
      {
        amount_cents: input.amount_cents,
        description: input.description,
        ...(input.occurred_on ? { occurred_on: input.occurred_on } : {}),
        visibility: input.visibility,
        idempotency_key: input.idempotency_key,
      },
      { count: "exact" }
    )
    .eq("id", input.expense_id);

  if (error) {
    throw new ExpenseDbError(
      `updateExpenseWithSplits update failed: ${error.message}`,
      error.code ?? null
    );
  }
  if (!count) {
    throw new ExpenseDbError(
      "updateExpenseWithSplits matched no row",
      EXPENSE_NO_ROW
    );
  }

  const { error: upsertError } = await supabase.from("expense_splits").upsert(
    splits.map((s) => ({
      expense_id: input.expense_id,
      trip_member_id: s.trip_member_id,
      amount_cents: s.amount_cents,
    })),
    { onConflict: "expense_id,trip_member_id" }
  );

  if (upsertError) {
    throw new ExpenseDbError(
      `updateExpenseWithSplits splits upsert failed: ${upsertError.message}`,
      upsertError.code ?? null
    );
  }

  const keep = `(${memberIds.join(",")})`;
  const { error: pruneError } = await supabase
    .from("expense_splits")
    .delete()
    .eq("expense_id", input.expense_id)
    .not("trip_member_id", "in", keep);

  if (pruneError) {
    throw new ExpenseDbError(
      `updateExpenseWithSplits splits prune failed: ${pruneError.message}`,
      pruneError.code ?? null
    );
  }
}

/**
 * Delete an expense (#383). Payer-or-organizer via RLS; split rows
 * follow through the `expense_splits.expense_id` FK cascade (cascades
 * are referential actions — they don't re-check split RLS).
 */
export async function deleteExpense(
  supabase: SupabaseClient,
  expenseId: string
): Promise<void> {
  const { error, count } = await supabase
    .from("expenses")
    .delete({ count: "exact" })
    .eq("id", expenseId);

  if (error) {
    throw new ExpenseDbError(
      `deleteExpense failed: ${error.message}`,
      error.code ?? null
    );
  }
  if (!count) {
    throw new ExpenseDbError("deleteExpense matched no row", EXPENSE_NO_ROW);
  }
}
