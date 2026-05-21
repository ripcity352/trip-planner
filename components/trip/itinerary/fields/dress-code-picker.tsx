"use client";

/**
 * DressCodePicker — chip picker with freeform fallback for itinerary items.
 *
 * Chip labels are voice-locked: sourced verbatim from DRESS_CODE_CHIPS in
 * lib/data/dress-codes.ts. No inline string literals for chip copy.
 *
 * Behavior:
 *   - Single-select: clicking a chip sets value to chip text; clicking the
 *     same chip again clears (undefined).
 *   - Mutual exclusivity: typing in freeform clears chip selection; clicking
 *     a chip clears the freeform input.
 *   - Value flows out via onChange(value: string | undefined).
 *
 * Mobile-first: chip tap targets min-h-[44px], chip wrap natural.
 * Persimmon focus-ring on :focus-visible via focus-visible:ring-ring (CSS var --ring).
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { DRESS_CODE_CHIPS, type DressCodeChip } from "@/lib/data/dress-codes";
import { M4_UI_STRINGS } from "@/lib/copy/empty-states";

export interface DressCodePickerProps {
  /** Current value — either a chip label or a freeform string. */
  value?: string;
  onChange: (value: string | undefined) => void;
  disabled?: boolean;
  /** id forwarded to the freeform input for label association. */
  id?: string;
}

export function DressCodePicker({
  value,
  onChange,
  disabled = false,
  id,
}: DressCodePickerProps) {
  // Determine if the current value is one of the locked chip labels.
  const selectedChip: DressCodeChip | undefined = DRESS_CODE_CHIPS.find(
    (chip) => chip === value
  );

  // Freeform is non-empty only when value is set but is NOT a chip label.
  const freeformValue = value !== undefined && selectedChip === undefined ? value : "";

  const handleChipClick = (chip: DressCodeChip) => {
    if (selectedChip === chip) {
      // Toggle off: clear the value.
      onChange(undefined);
    } else {
      onChange(chip);
    }
  };

  const handleFreeformChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    onChange(text === "" ? undefined : text);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Chip grid — wraps naturally on narrow viewports */}
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Dress code options"
      >
        {DRESS_CODE_CHIPS.map((chip) => {
          const isSelected = selectedChip === chip;
          return (
            <button
              key={chip}
              type="button"
              role="button"
              aria-pressed={isSelected}
              disabled={disabled}
              onClick={() => handleChipClick(chip)}
              className={cn(
                // Tap target: min-h-[44px] satisfies the ≥44px mobile requirement.
                "inline-flex items-center justify-center rounded-full border px-4 min-h-[44px]",
                "text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-50",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted"
              )}
            >
              {chip}
            </button>
          );
        })}
      </div>

      {/* Freeform fallback */}
      <input
        id={id}
        type="text"
        role="textbox"
        value={freeformValue}
        onChange={handleFreeformChange}
        disabled={disabled}
        placeholder={M4_UI_STRINGS.itineraryItem_dressCode_placeholder}
        className={cn(
          "w-full rounded-md border border-border bg-background px-3 py-2 text-sm",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
      />
    </div>
  );
}
