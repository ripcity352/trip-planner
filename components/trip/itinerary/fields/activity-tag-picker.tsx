"use client";

/**
 * ActivityTagPicker — multi-select chip picker with freeform fallback.
 *
 * Seed chips come from ACTIVITY_TAG_CHIPS (neutral only per Voice C2).
 * Custom tags typed into the freeform input are appended to the value array.
 * Removing a custom tag is done via an × affordance on the tag chip.
 *
 * Value type: string[]
 * Mobile-first: chips wrap, minimum 44px tap targets.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { ACTIVITY_TAG_CHIPS } from "@/lib/data/activity-tags";

export interface ActivityTagPickerProps {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}

export function ActivityTagPicker({
  value,
  onChange,
  disabled = false,
}: ActivityTagPickerProps) {
  const [inputText, setInputText] = React.useState("");

  // Tags in value that are NOT one of the seed chips (custom freeform tags)
  const customTags = value.filter(
    (v) => !(ACTIVITY_TAG_CHIPS as readonly string[]).includes(v)
  );

  const handleSeedChipClick = (chip: string) => {
    if (disabled) return;
    const isSelected = value.includes(chip);
    onChange(
      isSelected ? value.filter((v) => v !== chip) : [...value, chip]
    );
  };

  const commitFreeformTag = () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    // Skip duplicates
    if (value.includes(trimmed)) {
      setInputText("");
      return;
    }
    onChange([...value, trimmed]);
    setInputText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitFreeformTag();
    }
  };

  const handleBlur = () => {
    commitFreeformTag();
  };

  const handleRemoveCustomTag = (tag: string) => {
    if (disabled) return;
    onChange(value.filter((v) => v !== tag));
  };

  const chipBase = cn(
    "inline-flex items-center justify-center rounded-full border px-3 py-1 text-sm font-medium",
    "min-h-[44px] min-w-[44px]",
    "transition-colors",
    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
    "disabled:cursor-not-allowed disabled:opacity-60"
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Seed chip row — wraps on mobile */}
      <div className="flex flex-wrap gap-2">
        {ACTIVITY_TAG_CHIPS.map((chip) => {
          const isSelected = value.includes(chip);
          return (
            <button
              key={chip}
              type="button"
              role="button"
              aria-pressed={isSelected}
              disabled={disabled}
              onClick={() => handleSeedChipClick(chip)}
              className={cn(
                chipBase,
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

      {/* Custom tags row */}
      {customTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {customTags.map((tag) => (
            <span
              key={tag}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-sm font-medium text-foreground",
                "min-h-[44px]"
              )}
            >
              {tag}
              <button
                type="button"
                disabled={disabled}
                aria-label={`Remove ${tag}`}
                onClick={() => handleRemoveCustomTag(tag)}
                className={cn(
                  "ml-1 rounded-full p-0.5",
                  "hover:bg-destructive/20 focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-none",
                  "disabled:cursor-not-allowed disabled:opacity-60"
                )}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Freeform input */}
      <input
        type="text"
        role="textbox"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder="Add custom tag…"
        className={cn(
          "w-full rounded-xs border border-border bg-background px-3 py-2 text-sm",
          "placeholder:text-muted-foreground",
          "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-60"
        )}
      />
    </div>
  );
}
