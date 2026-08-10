"use client";

/**
 * ViewToggle — the Compact | Full density switch for the arrivals manifest
 * (#579).
 *
 * This is the SINGLE density control: Compact is the read-only chronological
 * glance, Full is today's detail-card list (the surface for editing /
 * confirming a tag / adding to a flight). There is deliberately no per-row
 * expand — one control, one mental model.
 *
 * Modeled as a group of two aria-pressed toggle buttons rather than
 * tabs/radiogroup: it's the same content shown at two densities, not a
 * choice between N distinct views, so "pressed" is the honest semantics.
 */

import { cn } from "@/lib/utils";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

export type ArrivalsView = "compact" | "full";

export interface ViewToggleProps {
  value: ArrivalsView;
  onChange: (next: ArrivalsView) => void;
}

const OPTIONS: ReadonlyArray<{ view: ArrivalsView; label: string }> = [
  { view: "compact", label: M3_UI_STRINGS.arrivals_view_toggle_compact },
  { view: "full", label: M3_UI_STRINGS.arrivals_view_toggle_full },
];

export function ViewToggle({ value, onChange }: ViewToggleProps) {
  return (
    <div
      role="group"
      aria-label={M3_UI_STRINGS.arrivals_view_toggle_label}
      className="border-border inline-flex gap-0.5 rounded-xs border p-0.5"
    >
      {OPTIONS.map(({ view, label }) => {
        const active = value === view;
        return (
          <button
            key={view}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(view)}
            className={cn(
              "focus-visible:ring-ring h-8 rounded-xs px-3 text-xs font-medium",
              "focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none",
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
