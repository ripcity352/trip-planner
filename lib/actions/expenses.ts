"use server";

/**
 * Server actions for expenses (#372 — expenses MVP).
 *
 *   - `addExpenseAction(input, idempotencyKey)` validates, authenticates,
 *     rate-limits (ADD_EXPENSE), computes a deterministic even split via
 *     `evenSplitCents`, and writes through `createExpenseWithSplits`.
 *
 * Deliberately absent: update/delete — `expenses` has no UPDATE/DELETE
 * RLS policies yet (migration-gated batch, see #372/#371 notes). Payer
 * is always `auth.uid()` (the INSERT policy enforces it); logging an
 * expense someone else paid is out of MVP scope.
 *
 * Split membership is the CALLER'S choice per rule 8 — the action never
 * assumes "everyone splits"; the UI decides its own preselection.
 */

import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import {
  createExpenseWithSplits,
  type CreateExpenseInput,
} from "@/lib/db/expenses";
import { evenSplitCents } from "@/lib/utils/split-cents";
import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  rateLimitedAction,
} from "@/lib/rate-limit";
import type { ErrorKey } from "@/lib/copy/errors";
import type { Expense } from "@/lib/db/types";

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

export type AddExpenseActionInput = z.infer<typeof addExpenseSchema>;

export type AddExpenseResult =
  | { ok: true; expense: Expense }
  | { ok: false; errorKey: ErrorKey };

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
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("RLS") || message.includes("42501")) {
      return { ok: false, errorKey: "rls_denied" };
    }
    console.error("[expenses] addExpenseAction unexpected:", err);
    return { ok: false, errorKey: "expense_add_failed" };
  }
}
