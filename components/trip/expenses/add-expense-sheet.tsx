"use client";

/**
 * AddExpenseSheet — toggle + form for logging a spend (#372).
 *
 * Mirrors the AddItemFormSheet show/hide pattern (no animation lib).
 * Split membership is chip-based: every member starts SELECTED (one tap
 * removes someone) — the payer is making an explicit authored choice,
 * which is the rule-8-compliant framing for a payer-side split; attendee
 * self-defaults are a different axis (the M5 opt-in money pool).
 *
 * Amount is a dollars string (decimal, ≤2 places) converted to integer
 * cents here — the action and DB only ever see cents.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { addExpenseAction } from "@/lib/actions/expenses";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { callAction } from "@/lib/ui/call-action";
import { FIELD_ERRORS } from "@/lib/copy/field-errors";
import { M5_UI_STRINGS } from "@/lib/copy/empty-states";
import {
  readableVisibilityOptions,
  type ViewerVisibilityContext,
} from "@/lib/utils/expense-visibility";
import { EXPENSE_VISIBILITY_LABELS } from "./visibility-labels";

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

/** Shared with EditExpenseSheet — same fields, prefilled there (#383). */
export const expenseFormSchema = z.object({
  // #401: field-error copy sourced from lib/copy (voice-tested), not inline.
  description: z
    .string()
    .trim()
    .min(1, FIELD_ERRORS.expense_description_required)
    .max(200),
  amountDollars: z
    .string()
    .trim()
    .regex(AMOUNT_RE, FIELD_ERRORS.expense_amount_invalid)
    .refine((v) => parseFloat(v) > 0, FIELD_ERRORS.expense_amount_required),
  occurredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  visibility: z.enum(["everyone", "organizers_only", "hide_from_celebrant"]),
});

export type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

export interface SplitCandidate {
  /** trip_members.id */
  memberId: string;
  name: string;
}

export interface AddExpenseSheetProps {
  tripId: string;
  members: SplitCandidate[];
  /**
   * Viewer's seat (#384): the visibility options are filtered to what
   * this member could still read — the celebrant never sees the hiding
   * mechanism aimed at them (rule 11).
   */
  viewer: ViewerVisibilityContext;
}

/** Dollars string (pre-validated by AMOUNT_RE) → integer cents. */
export function dollarsToCents(dollars: string): number {
  const [whole, frac = ""] = dollars.split(".");
  return parseInt(whole, 10) * 100 + parseInt(frac.padEnd(2, "0") || "0", 10);
}

export function AddExpenseSheet({
  tripId,
  members,
  viewer,
}: AddExpenseSheetProps) {
  const router = useRouter();
  const visibilityOptions = readableVisibilityOptions(viewer);
  const [open, setOpen] = React.useState(false);
  const [serverErrorKey, setServerErrorKey] = React.useState<ErrorKey | null>(
    null
  );
  // Everyone starts in the split; the payer taps people out.
  const [splitIds, setSplitIds] = React.useState<Set<string>>(
    () => new Set(members.map((m) => m.memberId))
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: { visibility: "everyone" },
  });

  const toggleMember = (memberId: string) => {
    setSplitIds((prev) => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const onSubmit = async (values: ExpenseFormValues) => {
    setServerErrorKey(null);
    if (splitIds.size === 0) {
      setServerErrorKey("validation_failed");
      return;
    }
    // Generate idempotency key at submit time — drunk-user double-tap
    // safety; a transport replay collapses on (trip_id, key).
    const idempotencyKey = crypto.randomUUID();

    // #431: rejected awaits resolve to the network envelope via callAction.
    const result = await callAction(() =>
      addExpenseAction(
        {
          tripId,
          description: values.description,
          amountCents: dollarsToCents(values.amountDollars),
          ...(values.occurredOn ? { occurredOn: values.occurredOn } : {}),
          visibility: values.visibility,
          splitMemberIds: [...splitIds],
        },
        idempotencyKey
      )
    );

    if (!result.ok) {
      setServerErrorKey(result.errorKey);
      return;
    }

    reset();
    setSplitIds(new Set(members.map((m) => m.memberId)));
    setOpen(false);
    router.refresh();
  };

  const inputClass = cn(
    "w-full rounded-xs border border-border bg-background px-3 py-2 text-sm",
    "placeholder:text-muted-foreground",
    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
    "disabled:cursor-not-allowed disabled:opacity-60"
  );
  const labelClass = "text-sm font-medium";

  if (!open) {
    return (
      <Button type="button" onClick={() => setOpen(true)}>
        {M5_UI_STRINGS.expenses_add_cta}
      </Button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="flex flex-col gap-4 rounded-sm border border-border bg-card p-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="expense-description" className={labelClass}>
          {M5_UI_STRINGS.expensesForm_description_label}
        </label>
        <input
          id="expense-description"
          type="text"
          className={cn(inputClass, errors.description && "border-red-400")}
          placeholder={M5_UI_STRINGS.expensesForm_description_placeholder}
          disabled={isSubmitting}
          aria-invalid={errors.description ? "true" : undefined}
          aria-describedby={
            errors.description ? "expense-description-error" : undefined
          }
          {...register("description")}
        />
        {/* #401: a rejected field must SAY why, not just shift a border. */}
        {errors.description ? (
          <p
            id="expense-description-error"
            role="alert"
            className={cn(ERROR_LINE_CLASS, "text-sm")}
          >
            {errors.description.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="expense-amount" className={labelClass}>
          {M5_UI_STRINGS.expensesForm_amount_label}
        </label>
        <input
          id="expense-amount"
          type="text"
          inputMode="decimal"
          className={cn(inputClass, errors.amountDollars && "border-red-400")}
          placeholder={M5_UI_STRINGS.expensesForm_amount_placeholder}
          disabled={isSubmitting}
          aria-invalid={errors.amountDollars ? "true" : undefined}
          aria-describedby={
            errors.amountDollars ? "expense-amount-error" : undefined
          }
          {...register("amountDollars")}
        />
        {/* #401: amount "0" / blank now names the rule ("over $0"), not a
            bare red border with no text. */}
        {errors.amountDollars ? (
          <p
            id="expense-amount-error"
            role="alert"
            className={cn(ERROR_LINE_CLASS, "text-sm")}
          >
            {errors.amountDollars.message}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="expense-date" className={labelClass}>
          {M5_UI_STRINGS.expensesForm_date_label}
        </label>
        <input
          id="expense-date"
          type="date"
          className={inputClass}
          disabled={isSubmitting}
          {...register("occurredOn")}
        />
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className={labelClass}>
          {M5_UI_STRINGS.expensesForm_split_label}
        </legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {members.map((m) => {
            const selected = splitIds.has(m.memberId);
            return (
              <button
                key={m.memberId}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleMember(m.memberId)}
                disabled={isSubmitting}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                  selected
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-muted text-muted-foreground"
                )}
              >
                {m.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* A single readable option means "everyone" (the form default) —
          skip the field entirely rather than render a one-item select.
          For the celebrant that's the whole point: no hiding mechanism
          in their own composer (#384 layer 2 / rule 11). */}
      {visibilityOptions.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="expense-visibility" className={labelClass}>
            {M5_UI_STRINGS.expensesForm_visibility_label}
          </label>
          <select
            id="expense-visibility"
            className={inputClass}
            disabled={isSubmitting}
            {...register("visibility")}
          >
            {visibilityOptions.map((v) => (
              <option key={v} value={v}>
                {EXPENSE_VISIBILITY_LABELS[v]}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {serverErrorKey ? (
        <p role="alert" className="text-sm">
          {ERRORS[serverErrorKey] ?? ERRORS.network}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
          {M5_UI_STRINGS.expensesForm_submit}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={isSubmitting}
          onClick={() => {
            setServerErrorKey(null);
            setOpen(false);
          }}
        >
          {M5_UI_STRINGS.expensesForm_cancel}
        </Button>
      </div>
    </form>
  );
}
