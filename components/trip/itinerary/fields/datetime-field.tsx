"use client";

/**
 * DatetimeField — shim that wraps DateTimeLocalFieldImpl.
 *
 * W2b: swapped from a plain `<input type="date">` to the full datetime-local
 * widget rendered in the trip's timezone.  The shim's public props are a
 * superset of the old ones so callers (EditItemForm) can pass tripTimezone
 * without changing the import.
 */

import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { DateTimeLocalFieldImpl } from "./datetime-local-field-impl";

export interface DatetimeFieldProps {
  /** UTC ISO-8601 string, or empty string / null when no time is set. */
  value: string | null | undefined;
  /** Called with UTC ISO-8601 string, or null when cleared. */
  onChange: (value: string | null) => void;
  disabled: boolean;
  /** IANA timezone from `trips.timezone`. Required by W2b. */
  tripTimezone: string;
  /** Validation error message, if any. */
  error?: string;
}

const labelClass = "block text-sm font-medium text-foreground mb-1";

export function DatetimeField({
  value,
  onChange,
  disabled,
  tripTimezone,
  error,
}: DatetimeFieldProps) {
  return (
    <div>
      <label htmlFor="edit-datetime" className={labelClass}>
        {M3_UI_STRINGS.itineraryForm_starts_label}
      </label>
      <DateTimeLocalFieldImpl
        id="edit-datetime"
        value={value}
        onChange={onChange}
        disabled={disabled}
        tripTimezone={tripTimezone}
        error={error}
      />
    </div>
  );
}
