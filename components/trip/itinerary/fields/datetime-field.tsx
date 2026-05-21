"use client";

/**
 * DatetimeField — extracted from edit-item-form.tsx (pre-split).
 *
 * W2b (datetime) will replace this simple date input with a richer datetime
 * picker. Pre-split here to eliminate the four-way line conflict risk across
 * W1a/W1b/W2a/W2b. Net behavior: identical to the inline field in EditItemForm.
 */

import { cn } from "@/lib/utils";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

export interface DatetimeFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  /** Validation error message, if any. */
  error: string | undefined;
}

const inputClass = cn(
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm",
  "placeholder:text-muted-foreground",
  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
  "disabled:cursor-not-allowed disabled:opacity-60"
);

const labelClass = "block text-sm font-medium text-foreground mb-1";

export function DatetimeField({ value, onChange, disabled, error }: DatetimeFieldProps) {
  return (
    <div>
      <label htmlFor="edit-day" className={labelClass}>
        {M3_UI_STRINGS.itineraryForm_starts_label}
      </label>
      <input
        id="edit-day"
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={inputClass}
      />
      {error ? (
        <p role="alert" className="text-destructive mt-1 text-xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
