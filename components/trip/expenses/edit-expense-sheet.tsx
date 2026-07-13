"use client";

/**
 * EditExpenseSheet — payer-or-organizer edit/delete for one expense
 * (#383). The page decides who gets it (payer or organizer — mirroring
 * the RLS scope); this component renders a small "Edit" affordance that
 * swaps to a prefilled form, following the EditItemFormSheet /
 * AddExpenseSheet patterns (show/hide, no animation lib).
 *
 * Delete is the M3 two-step: first tap arms the persimmon confirm
 * ("Take this off the tab? Can't undo."), second tap commits.
 *
 * Split re-computation matches the add path exactly: the action runs
 * `evenSplitCents` over the selected member ids, so an edited amount
 * re-splits sum-exact.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { callAction } from "@/lib/ui/call-action";
import { Button } from "@/components/ui/button";
import {
  deleteExpenseAction,
  updateExpenseAction,
} from "@/lib/actions/expenses";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { M5_UI_STRINGS } from "@/lib/copy/empty-states";
import {
  readableVisibilityOptions,
  type ExpenseVisibilityOption,
  type ViewerVisibilityContext,
} from "@/lib/utils/expense-visibility";
import type { Expense } from "@/lib/db/types";
import {
  dollarsToCents,
  expenseFormSchema,
  type ExpenseFormValues,
  type SplitCandidate,
} from "./add-expense-sheet";
import { EXPENSE_VISIBILITY_LABELS } from "./visibility-labels";

export interface EditExpenseSheetProps {
  tripId: string;
  expense: Expense;
  members: SplitCandidate[];
  /** trip_members.id values currently in the split. */
  initialSplitMemberIds: string[];
  /** Viewer's seat — same option filtering as the add sheet (#384). */
  viewer: ViewerVisibilityContext;
  className?: string;
}

/** Integer cents → dollars string for the amount input ("4500" → "45.00"). */
export function centsToDollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function EditExpenseSheet({
  tripId,
  expense,
  members,
  initialSplitMemberIds,
  viewer,
  className,
}: EditExpenseSheetProps) {
  const router = useRouter();
  const visibilityOptions = readableVisibilityOptions(viewer);
  const [open, setOpen] = React.useState(false);
  const [serverErrorKey, setServerErrorKey] = React.useState<ErrorKey | null>(
    null
  );
  const [deleteConfirm, setDeleteConfirm] = React.useState(false);
  const [isDeleting, startDeleteTransition] = React.useTransition();
  const [splitIds, setSplitIds] = React.useState<Set<string>>(
    () => new Set(initialSplitMemberIds)
  );

  // A viewer who can see the card can read its visibility, so this is
  // in-options for every legit path; "everyone" is a type-safe fallback
  // for the deferred `custom` value.
  const defaultVisibility: ExpenseVisibilityOption = (
    visibilityOptions as string[]
  ).includes(expense.visibility)
    ? (expense.visibility as ExpenseVisibilityOption)
    : "everyone";

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      description: expense.description,
      amountDollars: centsToDollars(expense.amount_cents),
      occurredOn: expense.occurred_on,
      visibility: defaultVisibility,
    },
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
    const idempotencyKey = crypto.randomUUID();

    // #431: rejected awaits resolve to the network envelope via callAction.
    const result = await callAction(() =>
      updateExpenseAction(
        {
          tripId,
          expenseId: expense.id,
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

    setOpen(false);
    router.refresh();
  };

  const handleDelete = () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }

    startDeleteTransition(async () => {
      setServerErrorKey(null);
      const result = await callAction(() =>
        deleteExpenseAction({ tripId, expenseId: expense.id }, crypto.randomUUID())
      );
      if (!result.ok) {
        setServerErrorKey(result.errorKey);
        setDeleteConfirm(false);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "focus-visible:ring-ring rounded-xs border border-border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground",
          "hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
          className
        )}
      >
        {M5_UI_STRINGS.expenses_edit_cta}
      </button>
    );
  }

  const inputClass = cn(
    "w-full rounded-xs border border-border bg-background px-3 py-2 text-sm",
    "placeholder:text-muted-foreground",
    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
    "disabled:cursor-not-allowed disabled:opacity-60"
  );
  const labelClass = "text-sm font-medium";
  const isBusy = isSubmitting || isDeleting;

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className={cn(
        "flex flex-col gap-4 rounded-sm border border-border bg-card p-4",
        className
      )}
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`edit-expense-description-${expense.id}`} className={labelClass}>
          {M5_UI_STRINGS.expensesForm_description_label}
        </label>
        <input
          id={`edit-expense-description-${expense.id}`}
          type="text"
          className={inputClass}
          disabled={isBusy}
          {...register("description")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`edit-expense-amount-${expense.id}`} className={labelClass}>
          {M5_UI_STRINGS.expensesForm_amount_label}
        </label>
        <input
          id={`edit-expense-amount-${expense.id}`}
          type="text"
          inputMode="decimal"
          className={cn(inputClass, errors.amountDollars && "border-red-400")}
          disabled={isBusy}
          {...register("amountDollars")}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        {/* Not the add sheet's "(today if blank)" — clearing the date
            here keeps the stored one (the update omits the column). */}
        <label htmlFor={`edit-expense-date-${expense.id}`} className={labelClass}>
          {M5_UI_STRINGS.expensesForm_date_label_edit}
        </label>
        <input
          id={`edit-expense-date-${expense.id}`}
          type="date"
          className={inputClass}
          disabled={isBusy}
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
                disabled={isBusy}
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

      {/* Same single-option rule as the add sheet: never render a
          one-item select — and never show the celebrant the hiding
          mechanism (#384 layer 2 / rule 11). */}
      {visibilityOptions.length > 1 ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`edit-expense-visibility-${expense.id}`} className={labelClass}>
            {M5_UI_STRINGS.expensesForm_visibility_label}
          </label>
          <select
            id={`edit-expense-visibility-${expense.id}`}
            className={inputClass}
            disabled={isBusy}
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

      {deleteConfirm ? (
        <p className="text-destructive text-sm font-medium">
          {M5_UI_STRINGS.expensesForm_delete_confirm}
        </p>
      ) : null}

      {serverErrorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
          {ERRORS[serverErrorKey] ?? ERRORS.network}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button type="submit" disabled={isBusy} aria-busy={isSubmitting}>
            {M5_UI_STRINGS.expensesForm_submit_edit}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={isBusy}
            onClick={() => {
              setServerErrorKey(null);
              setDeleteConfirm(false);
              setOpen(false);
            }}
          >
            {M5_UI_STRINGS.expensesForm_cancel}
          </Button>
        </div>

        {/* #210 two-step destructive: confirm state escalates the
            persimmon outline — never a solid destructive flood. */}
        <button
          type="button"
          onClick={handleDelete}
          disabled={isBusy}
          className={cn(
            "focus-visible:ring-ring rounded-xs border px-5 py-2 text-sm font-medium",
            "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60",
            deleteConfirm
              ? "border-destructive bg-destructive/10 text-destructive"
              : "border-destructive/40 text-destructive hover:bg-destructive/10"
          )}
        >
          {M5_UI_STRINGS.expensesForm_delete}
        </button>
      </div>
    </form>
  );
}
