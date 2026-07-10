"use server";

/**
 * Server actions for expenses (#372 — MVP; #383/#384 — correctable money).
 *
 *   - `addExpenseAction(input, idempotencyKey)` — validates,
 *     authenticates, rate-limits (ADD_EXPENSE), computes a deterministic
 *     even split via `evenSplitCents`, and writes through the atomic
 *     `create_expense_with_splits` RPC.
 *   - `updateExpenseAction(input, idempotencyKey)` — same shape, plus
 *     the expense id; recomputes the split and rewrites the rows.
 *     Payer-or-organizer via RLS (UPDATE policy, #383).
 *   - `deleteExpenseAction(input, idempotencyKey)` — payer-or-organizer
 *     via RLS (DELETE policy, #383). The key is accepted per rule 9 and
 *     validated; deletes are idempotent by nature so it isn't persisted.
 *
 * Visibility guard (#384 backstop): any mutation carrying a visibility
 * the ACTOR could not read back (celebrant + non-everyone, plain member
 * + organizers_only) is rejected with `expense_visibility_self_hidden`
 * — warm, retry-free copy. The role-filtered composer is the first
 * line; this holds when the composer is bypassed.
 *
 * Error mapping is by `error.code` via `ExpenseDbError` — NEVER message
 * text (#384: the old mapper grepped for "RLS"/"42501" and the real
 * Postgres message contains neither).
 *
 * Payer is always `auth.uid()` (the INSERT policy enforces it); logging
 * an expense someone else paid is out of scope. Split membership is the
 * CALLER'S choice per rule 8 — the action never assumes "everyone
 * splits"; the UI decides its own preselection.
 */

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  EXPENSE_NO_ROW,
  ExpenseDbError,
  createExpenseWithSplits,
  deleteExpense,
  updateExpenseWithSplits,
  type CreateExpenseInput,
  type UpdateExpenseInput,
} from "@/lib/db/expenses";
import { getViewerMember } from "@/lib/db/trips";
import { evenSplitCents } from "@/lib/utils/split-cents";
import {
  canViewerReadVisibility,
  isOrganizerRole,
  type ExpenseVisibilityOption,
} from "@/lib/utils/expense-visibility";
import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  rateLimitedAction,
} from "@/lib/rate-limit";
import type { ErrorKey } from "@/lib/copy/errors";
import type { Expense } from "@/lib/db/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const IDEMPOTENCY_KEY_SCHEMA = z.string().uuid();

/** $100,000 cap — a fat-fingered extra zero, not a gate on real trips. */
const AMOUNT_CENTS_MAX = 10_000_000;

const addExpenseSchema = z.object({
  tripId: z.string().uuid(),
  description: z.string().trim().min(1).max(200),
  amountCents: z.number().int().positive().max(AMOUNT_CENTS_MAX),
  /** YYYY-MM-DD (date-only register — never a timestamp). Omitted → today. */
  occurredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  // MVP surface: `custom` needs the content_visibility_grants join (M5).
  visibility: z.enum(["everyone", "organizers_only", "hide_from_celebrant"]),
  /** trip_members.id values chosen by the payer. Deduped by the split fn. */
  splitMemberIds: z.array(z.string().uuid()).min(1).max(50),
});

const updateExpenseSchema = addExpenseSchema.extend({
  expenseId: z.string().uuid(),
});

const deleteExpenseSchema = z.object({
  tripId: z.string().uuid(),
  expenseId: z.string().uuid(),
});

export type AddExpenseActionInput = z.infer<typeof addExpenseSchema>;
export type UpdateExpenseActionInput = z.infer<typeof updateExpenseSchema>;
export type DeleteExpenseActionInput = z.infer<typeof deleteExpenseSchema>;

export type AddExpenseResult =
  | { ok: true; expense: Expense }
  | { ok: false; errorKey: ErrorKey };

export type UpdateExpenseResult = { ok: true } | { ok: false; errorKey: ErrorKey };
export type DeleteExpenseResult = { ok: true } | { ok: false; errorKey: ErrorKey };

/**
 * #384 backstop: reject a visibility the acting member couldn't read
 * back. Returns an ErrorKey to short-circuit with, or null to proceed.
 * Skips the lookup on the `everyone` fast path.
 */
async function guardActorReadableVisibility(
  supabase: SupabaseClient,
  tripId: string,
  userId: string,
  visibility: ExpenseVisibilityOption
): Promise<ErrorKey | null> {
  if (visibility === "everyone") {
    return null;
  }
  const viewer = await getViewerMember(supabase, tripId, userId);
  if (!viewer) {
    return "rls_denied";
  }
  const readable = canViewerReadVisibility(visibility, {
    isOrganizer: isOrganizerRole(viewer.role),
    isCelebrant: viewer.is_celebrant,
  });
  return readable ? null : "expense_visibility_self_hidden";
}

/** Shared catch-block mapping — by `error.code`, never message text (#384). */
function mapExpenseError(err: unknown, fallback: ErrorKey): ErrorKey {
  if (err instanceof RateLimitError) {
    return "rate_limit";
  }
  if (err instanceof ExpenseDbError) {
    if (err.code === "42501" || err.code === EXPENSE_NO_ROW) {
      return "rls_denied";
    }
  }
  return fallback;
}

export async function addExpenseAction(
  input: AddExpenseActionInput,
  idempotencyKey: string
): Promise<AddExpenseResult> {
  const parsed = addExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const keyParse = IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey);
  if (!keyParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "auth_failed" };
  }
  const userId = authData.user.id;

  const guardKey = await guardActorReadableVisibility(
    supabase,
    parsed.data.tripId,
    userId,
    parsed.data.visibility
  );
  if (guardKey) {
    return { ok: false, errorKey: guardKey };
  }

  const splits = evenSplitCents(
    parsed.data.amountCents,
    parsed.data.splitMemberIds
  );

  const expenseInput: CreateExpenseInput = {
    trip_id: parsed.data.tripId,
    payer_id: userId, // INSERT RLS requires auth.uid() = payer_id
    amount_cents: parsed.data.amountCents,
    description: parsed.data.description,
    ...(parsed.data.occurredOn ? { occurred_on: parsed.data.occurredOn } : {}),
    visibility: parsed.data.visibility,
    idempotency_key: keyParse.data,
  };

  try {
    const expense = await rateLimitedAction(
      RATE_LIMIT_SCOPES.ADD_EXPENSE,
      userId,
      () => createExpenseWithSplits(supabase, expenseInput, splits)
    );
    return { ok: true, expense };
  } catch (err) {
    const errorKey = mapExpenseError(err, "expense_add_failed");
    if (errorKey === "expense_add_failed") {
      console.error("[expenses] addExpenseAction unexpected:", err);
    }
    return { ok: false, errorKey };
  }
}

export async function updateExpenseAction(
  input: UpdateExpenseActionInput,
  idempotencyKey: string
): Promise<UpdateExpenseResult> {
  const parsed = updateExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const keyParse = IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey);
  if (!keyParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "auth_failed" };
  }
  const userId = authData.user.id;

  const guardKey = await guardActorReadableVisibility(
    supabase,
    parsed.data.tripId,
    userId,
    parsed.data.visibility
  );
  if (guardKey) {
    return { ok: false, errorKey: guardKey };
  }

  const splits = evenSplitCents(
    parsed.data.amountCents,
    parsed.data.splitMemberIds
  );

  const updateInput: UpdateExpenseInput = {
    expense_id: parsed.data.expenseId,
    amount_cents: parsed.data.amountCents,
    description: parsed.data.description,
    ...(parsed.data.occurredOn ? { occurred_on: parsed.data.occurredOn } : {}),
    visibility: parsed.data.visibility,
    idempotency_key: keyParse.data,
  };

  try {
    await rateLimitedAction(RATE_LIMIT_SCOPES.UPDATE_EXPENSE, userId, () =>
      updateExpenseWithSplits(supabase, updateInput, splits)
    );
    return { ok: true };
  } catch (err) {
    const errorKey = mapExpenseError(err, "expense_update_failed");
    if (errorKey === "expense_update_failed") {
      console.error("[expenses] updateExpenseAction unexpected:", err);
    }
    return { ok: false, errorKey };
  }
}

export async function deleteExpenseAction(
  input: DeleteExpenseActionInput,
  idempotencyKey: string
): Promise<DeleteExpenseResult> {
  const parsed = deleteExpenseSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const keyParse = IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey);
  if (!keyParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "auth_failed" };
  }
  const userId = authData.user.id;

  try {
    await rateLimitedAction(RATE_LIMIT_SCOPES.DELETE_EXPENSE, userId, () =>
      deleteExpense(supabase, parsed.data.expenseId)
    );
    return { ok: true };
  } catch (err) {
    const errorKey = mapExpenseError(err, "expense_delete_failed");
    if (errorKey === "expense_delete_failed") {
      console.error("[expenses] deleteExpenseAction unexpected:", err);
    }
    return { ok: false, errorKey };
  }
}
