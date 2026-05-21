"use client";

/**
 * AddressField — extracted from edit-item-form.tsx (pre-split).
 *
 * W2a (address) will replace this freeform input with a places-API widget.
 * Pre-split here to eliminate the four-way line conflict risk across
 * W1a/W1b/W2a/W2b. Net behavior: identical to the inline field in EditItemForm.
 */

import { cn } from "@/lib/utils";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

export interface AddressFieldProps {
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

export function AddressField({ value, onChange, disabled }: AddressFieldProps) {
  return (
    <div>
      <label htmlFor="edit-address" className={labelClass}>
        {M3_UI_STRINGS.itineraryForm_address_label}
      </label>
      <input
        id="edit-address"
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={M3_UI_STRINGS.itineraryForm_address_placeholder}
        disabled={disabled}
        className={inputClass}
      />
    </div>
  );
}
