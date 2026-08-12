"use client";

/**
 * ShoppingItemEditForm — Task 7b inline amend/edit (name/category/cost),
 * rendered inline in `ShoppingItemSheet` when the viewer taps "Edit". Not a
 * nested dialog — it's the sheet's own header content swapped for a form.
 *
 * Field shapes mirror `AddItemSheet` (name text input, single-select
 * category chip row, cost as a decimal-string input converted via
 * `dollarsToCents`) for consistency, but this form does NOT reuse RHF/zod —
 * the partial-patch contract (only send what changed) is a diff against the
 * current `item`, not a single-shot create-form validation, so a bespoke
 * small `useState` set is simpler here.
 *
 * Partial-patch discipline (mirrors `amendShoppingItem`'s contract,
 * lib/actions/shopping-list.ts): the patch sent to the action is built by
 * comparing each field to the CURRENT item, not by always sending all
 * three. `undefined` (key omitted) means "unchanged" to the action; `null`
 * (category/costCents only) means "explicitly clear". Never include a key
 * whose value equals the current item's — that's the gap-A guarantee this
 * task exists to close (amending just the name must not null out category
 * or cost).
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  amendShoppingItem,
  type AmendShoppingItemInput,
} from "@/lib/actions/shopping-list";
import { dollarsToCents } from "@/components/trip/expenses/add-expense-sheet";
import { callAction } from "@/lib/ui/call-action";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";
import type { ShoppingItem } from "@/lib/db/types";
import { CATEGORY_CHIPS } from "./category-chips";

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

/** Integer cents -> a decimal-string prefill for the cost input (inverse of `dollarsToCents`). */
function centsToDollarsString(cents: number): string {
  return (cents / 100).toFixed(2);
}

export interface ShoppingItemEditFormProps {
  item: ShoppingItem;
  /** Confirmed ok:true — parent exits edit mode. This form calls router.refresh() itself. */
  onSaved: () => void;
  onCancel: () => void;
}

export function ShoppingItemEditForm({
  item,
  onSaved,
  onCancel,
}: ShoppingItemEditFormProps) {
  const router = useRouter();
  const [name, setName] = React.useState(item.name);
  const [category, setCategory] = React.useState<string | null>(
    item.category
  );
  const [costDollars, setCostDollars] = React.useState(
    item.cost_cents != null ? centsToDollarsString(item.cost_cents) : ""
  );
  const [isPending, setIsPending] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);

  const trimmedName = name.trim();
  const trimmedCost = costDollars.trim();
  const nameInvalid = trimmedName.length === 0 || trimmedName.length > 120;
  const costInvalid = trimmedCost !== "" && !AMOUNT_RE.test(trimmedCost);

  const patch = React.useMemo(() => {
    const p: AmendShoppingItemInput = {};
    if (!nameInvalid && trimmedName !== item.name) {
      p.name = trimmedName;
    }
    if (category !== item.category) {
      p.category = category;
    }
    if (!costInvalid) {
      const nextCostCents = trimmedCost === "" ? null : dollarsToCents(trimmedCost);
      if (nextCostCents !== item.cost_cents) {
        p.costCents = nextCostCents;
      }
    }
    return p;
  }, [nameInvalid, trimmedName, category, costInvalid, trimmedCost, item]);

  const hasChanges = Object.keys(patch).length > 0;
  const canSave = hasChanges && !nameInvalid && !costInvalid && !isPending;

  const handleSave = async () => {
    if (!canSave) return;
    setErrorKey(null);
    setIsPending(true);
    try {
      const result = await callAction(() => amendShoppingItem(item.id, patch));
      if (!result.ok) {
        setErrorKey(result.errorKey);
        return;
      }
      router.refresh();
      onSaved();
    } finally {
      setIsPending(false);
    }
  };

  const inputClass = cn(
    "w-full rounded-xs border border-border bg-background px-3 py-2 text-sm",
    "placeholder:text-muted-foreground",
    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
    "disabled:cursor-not-allowed disabled:opacity-60"
  );
  const labelClass = "text-sm font-medium";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="shopping-item-edit-name" className={labelClass}>
          {SHOPPING_LIST_UI_STRINGS.nameLabel}
        </label>
        <input
          id="shopping-item-edit-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={isPending}
          aria-invalid={nameInvalid ? "true" : undefined}
          className={cn(inputClass, nameInvalid && "border-red-400")}
        />
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
                disabled={isPending}
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
        <label htmlFor="shopping-item-edit-cost" className={labelClass}>
          {SHOPPING_LIST_UI_STRINGS.costLabel}
        </label>
        <input
          id="shopping-item-edit-cost"
          type="text"
          inputMode="decimal"
          value={costDollars}
          onChange={(e) => setCostDollars(e.target.value)}
          disabled={isPending}
          aria-invalid={costInvalid ? "true" : undefined}
          className={cn(inputClass, costInvalid && "border-red-400")}
        />
      </div>

      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
          {ERRORS[errorKey] ?? ERRORS.network}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button
          type="button"
          disabled={!canSave}
          aria-busy={isPending}
          onClick={handleSave}
        >
          {SHOPPING_LIST_UI_STRINGS.editSave}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={isPending}
          onClick={onCancel}
        >
          {SHOPPING_LIST_UI_STRINGS.cancelCta}
        </Button>
      </div>
    </div>
  );
}
