/**
 * Data layer for `expenses` + `expense_splits` (#372) — the first
 * consumers of a schema that shipped fully rule-compliant in M1 and sat
 * orphaned since.
 *
 * RLS summary (0001_init + m1_foundation rebuild):
 *   expenses:
 *     SELECT — `can_see_content(trip_id, visibility)` (visibility-aware:
 *              everyone / organizers_only / hide_from_celebrant / custom)
 *     INSERT — `is_trip_member(trip_id) AND auth.uid() = payer_id`
 *     UPDATE/DELETE — no policies exist yet; mutation beyond insert is
 *              MIGRATION-GATED and deliberately absent from this module.
 *   expense_splits:
 *     SELECT — members of the parent expense's trip
 *     ALL    — payer of the parent expense manages split rows
 *
 * Idempotency: `expenses_idempotency` partial unique on
 * `(trip_id, idempotency_key)`. Because expense + splits are two
 * statements (no RPC without a migration), `createExpenseWithSplits`
 * self-heals on replay: a 23505 re-selects the original expense and
 * inserts the splits ONLY if the first attempt died before writing them.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Expense, ExpenseSplit } from "./types";

const EXPENSE_COLUMNS =
  "id, trip_id, payer_id, amount_cents, currency, description, occurred_on, created_at, idempotency_key, visibility";

const SPLIT_COLUMNS = "expense_id, trip_member_id, amount_cents, currency";

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
 * Insert an expense and its split rows. Two statements by necessity
 * (an atomic RPC needs a migration — see #372); the replay path makes
 * the pair effectively idempotent:
 *
 *   1. INSERT expense. On 23505 (idempotency replay) re-select the
 *      original row by (trip_id, idempotency_key).
 *   2. Check for existing splits; insert `splits` only when none exist
 *      — heals a first attempt that died between the two statements.
 */
export async function createExpenseWithSplits(
  supabase: SupabaseClient,
  input: CreateExpenseInput,
  splits: CreateExpenseSplitInput[]
): Promise<Expense> {
  let expense: Expense;

  const { data, error } = await supabase
    .from("expenses")
    .insert({
      trip_id: input.trip_id,
      payer_id: input.payer_id,
      amount_cents: input.amount_cents,
      description: input.description,
      ...(input.occurred_on ? { occurred_on: input.occurred_on } : {}),
      visibility: input.visibility,
      idempotency_key: input.idempotency_key,
    })
    .select(EXPENSE_COLUMNS)
    .single();

  if (error) {
    if ((error as { code?: string }).code !== "23505") {
      throw new Error(`createExpenseWithSplits insert failed: ${error.message}`);
    }
    const { data: existing, error: selectError } = await supabase
      .from("expenses")
      .select(EXPENSE_COLUMNS)
      .eq("trip_id", input.trip_id)
      .eq("idempotency_key", input.idempotency_key)
      .single();
    if (selectError) {
      throw new Error(
        `createExpenseWithSplits replay re-select failed: ${selectError.message}`
      );
    }
    expense = existing as Expense;
  } else {
    expense = data as Expense;
  }

  const { data: existingSplits, error: splitCheckError } = await supabase
    .from("expense_splits")
    .select("expense_id")
    .eq("expense_id", expense.id)
    .limit(1);

  if (splitCheckError) {
    throw new Error(
      `createExpenseWithSplits split check failed: ${splitCheckError.message}`
    );
  }

  if (!existingSplits || existingSplits.length === 0) {
    const { error: splitError } = await supabase.from("expense_splits").insert(
      splits.map((s) => ({
        expense_id: expense.id,
        trip_member_id: s.trip_member_id,
        amount_cents: s.amount_cents,
      }))
    );
    if (splitError) {
      // The expense row exists but its splits don't — surfaced loudly so
      // the caller can tell the user; the NEXT submit with the same key
      // replays into the self-heal path above.
      throw new Error(
        `createExpenseWithSplits splits insert failed: ${splitError.message}`
      );
    }
  }

  return expense;
}
