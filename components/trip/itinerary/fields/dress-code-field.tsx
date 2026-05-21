"use client";

/**
 * DressCodeField — extracted from edit-item-form.tsx (pre-split).
 *
 * W1a (dress-code) will replace this freeform input with a chip picker.
 * Pre-split here to eliminate the four-way line conflict risk across
 * W1a/W1b/W2a/W2b. Net behavior: identical to the inline field in EditItemForm.
 */

import { cn } from "@/lib/utils";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

export interface DressCodeFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}

const inputClass = cn(
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm",
  "placeholder:text-muted-foreground",
  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
  "disabled:cursor-not-allowed disabled:opacity-60"
);

const labelClass = "block text-sm font-medium text-foreground mb-1";

export function DressCodeField({ value, onChange, disabled }: DressCodeFieldProps) {
  return (
    <div>
      <label htmlFor="edit-dress" className={labelClass}>
        {M3_UI_STRINGS.itineraryForm_dress_label}
      </label>
      <input
        id="edit-dress"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={inputClass}
      />
    </div>
  );
}
