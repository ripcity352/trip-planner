"use client";

/**
 * DateTimeLocalFieldImpl — native datetime-local picker rendered in the trip's
 * timezone.
 *
 * Design decisions:
 *   - Uses `<input type="datetime-local">` so mobile browsers auto-show a
 *     system date/time picker (no JS-only fallback needed).
 *   - Value is always rendered via `toLocalInputValue(..., tripTimezone)` so
 *     the display matches the trip's location — never the user's browser TZ
 *     (Coverage H1: never trust client TZ).
 *   - onChange converts back to UTC ISO via `fromLocalInputValue` before
 *     calling upstream. Upstream stores UTC; display is always localized.
 *   - Minimum tap target ≥44px (py-3 + text-sm = ~44px).
 */

import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { toLocalInputValue, fromLocalInputValue } from "@/lib/utils/format-trip-tz";

export interface DateTimeLocalFieldImplProps {
  /** UTC ISO-8601 string, or null/undefined when no time is set. */
  value: string | null | undefined;
  /** Called with UTC ISO-8601 string, or null when cleared/invalid. */
  onChange: (value: string | null) => void;
  disabled: boolean;
  /** IANA timezone string from `trips.timezone` (e.g. "America/New_York"). */
  tripTimezone: string;
  /** Validation error message, if any. */
  error?: string;
  /** Optional id for the input element. */
  id?: string;
}

const inputClass = cn(
  "w-full min-h-[44px] rounded-md border border-border bg-background px-3 py-3 text-sm",
  "placeholder:text-muted-foreground",
  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
  "disabled:cursor-not-allowed disabled:opacity-60"
);

export function DateTimeLocalFieldImpl({
  value,
  onChange,
  disabled,
  tripTimezone,
  error,
  id,
}: DateTimeLocalFieldImplProps) {
  const localValue = toLocalInputValue(value, tripTimezone);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (!raw) {
      onChange(null);
      return;
    }
    const utc = fromLocalInputValue(raw, tripTimezone);
    onChange(utc);
  };

  return (
    <div>
      <input
        id={id}
        type="datetime-local"
        value={localValue}
        onChange={handleChange}
        disabled={disabled}
        className={inputClass}
      />
      {error ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "mt-1 text-xs")}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
