"use client";

/**
 * AddItemSheet — toggle + form for adding a shopping-list item.
 *
 * Mirrors `AddExpenseSheet`'s show/hide pattern (RHF + zod, `callAction`,
 * submit-disable on `isSubmitting`).
 *
 * gap-B (idempotency): the key is seeded **once per sheet-open** — the
 * "open" button generates a fresh UUID before flipping `open` — and reused
 * across retries of the same logical add (a failed submit doesn't get a
 * new key). It rotates to a fresh UUID only after a confirmed `ok:true`.
 * This covers the rule-#9 replay case (submit succeeds, response lost,
 * user taps again → same key → 23505 replay, no dup) that a submit-time
 * key would miss.
 *
 * Category is a single-select chip row (client-only convenience — the
 * column is freeform text, not an enum). Cost is optional and USD-fixed
 * (no currency field). The "surprise" toggle renders only for a
 * non-celebrant viewer with a known celebrant name (gap-K: client-only
 * guard, RLS does not enforce it — see spec §7).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { addShoppingItem } from "@/lib/actions/shopping-list";
import { dollarsToCents } from "@/components/trip/expenses/add-expense-sheet";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { callAction } from "@/lib/ui/call-action";
import { FIELD_ERRORS } from "@/lib/copy/field-errors";
import { SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";
import type { ViewerMember } from "@/lib/db/trips";
import { CATEGORY_CHIPS } from "./category-chips";

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

const addItemFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, FIELD_ERRORS.shopping_item_name_required)
    .max(120),
  costDollars: z
    .string()
    .trim()
    .regex(AMOUNT_RE, FIELD_ERRORS.expense_amount_invalid)
    .optional()
    .or(z.literal("")),
});

type AddItemFormValues = z.infer<typeof addItemFormSchema>;

export interface AddItemSheetProps {
  tripId: string;
  viewer: ViewerMember;
  /** Celebrant's display name, or null if the trip has none set. */
  celebrantName: string | null;
}

export function AddItemSheet({ tripId, viewer, celebrantName }: AddItemSheetProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [category, setCategory] = React.useState<string | null>(null);
  const [surprise, setSurprise] = React.useState(false);
  const [serverErrorKey, setServerErrorKey] = React.useState<ErrorKey | null>(
    null
  );
  // gap-B — seeded on open, reused across retries, rotated only after a
  // confirmed ok:true. Plain state (not a ref) — react-hooks/refs flags
  // ref reads inside a function handed to RHF's handleSubmit, since that
  // call itself runs during render even though the closure only executes
  // on submit. Client-only (crypto.randomUUID), never generated at module
  // scope / initial render so there's no SSR hazard.
  const [idempotencyKey, setIdempotencyKey] = React.useState<string>("");

  const showSurpriseToggle = !viewer.is_celebrant && !!celebrantName;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<AddItemFormValues>({
    resolver: zodResolver(addItemFormSchema),
  });

  const onSubmit = async (values: AddItemFormValues) => {
    setServerErrorKey(null);

    const result = await callAction(() =>
      addShoppingItem(
        {
          tripId,
          name: values.name,
          category,
          costCents: values.costDollars ? dollarsToCents(values.costDollars) : null,
          ...(surprise ? { visibility: "hide_from_celebrant" as const } : {}),
        },
        idempotencyKey
      )
    );

    if (!result.ok) {
      setServerErrorKey(result.errorKey);
      return;
    }

    // Confirmed ok:true — rotate the key so a stray re-open with stale
    // state (shouldn't happen, belt-and-suspenders) never replays.
    setIdempotencyKey(crypto.randomUUID());
    reset();
    setCategory(null);
    setSurprise(false);
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
      <Button
        type="button"
        onClick={() => {
          // gap-B — fresh key on every real "open" event. A form left
          // open across retries never lands here again, so the key stays
          // put until either success (rotated above) or a fresh open.
          setIdempotencyKey(crypto.randomUUID());
          reset();
          setServerErrorKey(null);
          setCategory(null);
          setSurprise(false);
          setOpen(true);
        }}
      >
        {SHOPPING_LIST_UI_STRINGS.addDetailsCta}
      </Button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="border-border bg-card flex flex-col gap-4 rounded-sm border p-4"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="shopping-item-name" className={labelClass}>
          {SHOPPING_LIST_UI_STRINGS.nameLabel}
        </label>
        <input
          id="shopping-item-name"
          type="text"
          className={cn(inputClass, errors.name && "border-red-400")}
          placeholder={SHOPPING_LIST_UI_STRINGS.namePlaceholder}
          disabled={isSubmitting}
          aria-invalid={errors.name ? "true" : undefined}
          aria-describedby={errors.name ? "shopping-item-name-error" : undefined}
          {...register("name")}
        />
        {errors.name ? (
          <p
            id="shopping-item-name-error"
            role="alert"
            className={cn(ERROR_LINE_CLASS, "text-sm")}
          >
            {errors.name.message}
          </p>
        ) : null}
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className={labelClass}>
          {SHOPPING_LIST_UI_STRINGS.categoryLabel}
        </legend>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {CATEGORY_CHIPS.map((chip) => {
            const selected = category === chip.value;
            return (
              <button
                key={chip.value}
                type="button"
                aria-pressed={selected}
                disabled={isSubmitting}
                onClick={() => setCategory(selected ? null : chip.value)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                  selected
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-muted text-muted-foreground"
                )}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="shopping-item-cost" className={labelClass}>
          {SHOPPING_LIST_UI_STRINGS.costLabel}
        </label>
        <input
          id="shopping-item-cost"
          type="text"
          inputMode="decimal"
          className={cn(inputClass, errors.costDollars && "border-red-400")}
          disabled={isSubmitting}
          aria-invalid={errors.costDollars ? "true" : undefined}
          aria-describedby={
            errors.costDollars ? "shopping-item-cost-error" : undefined
          }
          {...register("costDollars")}
        />
        {errors.costDollars ? (
          <p
            id="shopping-item-cost-error"
            role="alert"
            className={cn(ERROR_LINE_CLASS, "text-sm")}
          >
            {errors.costDollars.message}
          </p>
        ) : null}
      </div>

      {showSurpriseToggle ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={surprise}
            disabled={isSubmitting}
            onChange={(e) => setSurprise(e.target.checked)}
          />
          {SHOPPING_LIST_UI_STRINGS.surpriseToggle_template.replace(
            "{name}",
            celebrantName ?? ""
          )}
        </label>
      ) : null}

      {serverErrorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
          {ERRORS[serverErrorKey] ?? ERRORS.network}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting} aria-busy={isSubmitting}>
          {SHOPPING_LIST_UI_STRINGS.submitCta}
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
          {SHOPPING_LIST_UI_STRINGS.cancelCta}
        </Button>
      </div>
    </form>
  );
}
