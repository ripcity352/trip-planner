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
import { M3_UI_STRINGS, M5_UI_STRINGS } from "@/lib/copy/empty-states";

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

const formSchema = z.object({
  description: z.string().trim().min(1).max(200),
  amountDollars: z
    .string()
    .trim()
    .regex(AMOUNT_RE)
    .refine((v) => parseFloat(v) > 0),
  occurredOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
  visibility: z.enum(["everyone", "organizers_only", "hide_from_celebrant"]),
});

type FormValues = z.infer<typeof formSchema>;

export interface SplitCandidate {
  /** trip_members.id */
  memberId: string;
  name: string;
}

export interface AddExpenseSheetProps {
  tripId: string;
  members: SplitCandidate[];
}

/** Dollars string (pre-validated by AMOUNT_RE) → integer cents. */
export function dollarsToCents(dollars: string): number {
  const [whole, frac = ""] = dollars.split(".");
  return parseInt(whole, 10) * 100 + parseInt(frac.padEnd(2, "0") || "0", 10);
}

export function AddExpenseSheet({ tripId, members }: AddExpenseSheetProps) {
  const router = useRouter();
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
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
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

  const onSubmit = async (values: FormValues) => {
    setServerErrorKey(null);
    if (splitIds.size === 0) {
      setServerErrorKey("validation_failed");
      return;
    }
    // Generate idempotency key at submit time — drunk-user double-tap
    // safety; a transport replay collapses on (trip_id, key).
    const idempotencyKey = crypto.randomUUID();

    const result = await addExpenseAction(
      {
        tripId,
        description: values.description,
        amountCents: dollarsToCents(values.amountDollars),
        ...(values.occurredOn ? { occurredOn: values.occurredOn } : {}),
        visibility: values.visibility,
        splitMemberIds: [...splitIds],
      },
      idempotencyKey
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
          className={inputClass}
          placeholder={M5_UI_STRINGS.expensesForm_description_placeholder}
          disabled={isSubmitting}
          {...register("description")}
        />
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
          {...register("amountDollars")}
        />
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
          <option value="everyone">
            {M3_UI_STRINGS.itineraryForm_visibility_everyone}
          </option>
          <option value="organizers_only">
            {M3_UI_STRINGS.itineraryForm_visibility_organizers}
          </option>
          <option value="hide_from_celebrant">
            {M3_UI_STRINGS.itineraryForm_visibility_hide_celebrant}
          </option>
        </select>
      </div>

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
