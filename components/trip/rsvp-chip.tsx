/**
 * RsvpChip — read-only display chip for a single RSVP state (#45).
 *
 * Uses BOTH a lucide-react icon AND color to signal each state, so
 * color is never the only signal (closes the a11y gap in Wave 3b).
 * Voice MEDIUM M1 rule: icons denote STATE, not progress.
 *
 * States:
 *   going      → Check      (green)
 *   maybe      → HelpCircle (amber)
 *   declined   → X          (red)
 *   noResponse → MinusCircle (muted)
 *
 * The chip root carries an `aria-label` from the copy palette so
 * screenreaders don't rely on color. The SVG icon is aria-hidden.
 */

import { Check, HelpCircle, MinusCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { M2_UI_STRINGS, M4_UI_STRINGS } from "@/lib/copy/empty-states";

export type RsvpChipStatus = "going" | "maybe" | "declined" | "noResponse";

export interface RsvpChipProps {
  status: RsvpChipStatus;
  className?: string;
}

interface ChipDef {
  label: string;
  ariaLabel: string;
  Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  colorClass: string;
  iconClass: string;
}

// Single source of truth for icon + color + copy per state.
// "State not progress" — Check is "you said yes", not "step completed".
const CHIP_DEFS: Record<RsvpChipStatus, ChipDef> = {
  going: {
    label: M2_UI_STRINGS.rsvp_chip_going,
    ariaLabel: M4_UI_STRINGS.rsvp_chip_aria_going,
    Icon: Check,
    colorClass:
      "border-green-600 bg-green-50 text-green-700 dark:border-green-500 dark:bg-green-950 dark:text-green-400",
    iconClass: "text-green-600 dark:text-green-400",
  },
  maybe: {
    label: M2_UI_STRINGS.rsvp_chip_maybe,
    ariaLabel: M4_UI_STRINGS.rsvp_chip_aria_maybe,
    Icon: HelpCircle,
    colorClass:
      "border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-400 dark:bg-amber-950 dark:text-amber-300",
    iconClass: "text-amber-500 dark:text-amber-400",
  },
  declined: {
    label: M2_UI_STRINGS.rsvp_chip_declined,
    ariaLabel: M4_UI_STRINGS.rsvp_chip_aria_declined,
    Icon: X,
    colorClass:
      "border-red-400 bg-red-50 text-red-700 dark:border-red-500 dark:bg-red-950 dark:text-red-400",
    iconClass: "text-red-500 dark:text-red-400",
  },
  noResponse: {
    label: M4_UI_STRINGS.rsvp_chip_aria_no_response,
    ariaLabel: M4_UI_STRINGS.rsvp_chip_aria_no_response,
    Icon: MinusCircle,
    colorClass:
      "border-border bg-muted text-muted-foreground",
    iconClass: "text-muted-foreground",
  },
};

export function RsvpChip({ status, className }: RsvpChipProps) {
  const def = CHIP_DEFS[status];
  const { Icon } = def;

  return (
    <span
      aria-label={def.ariaLabel}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium",
        def.colorClass,
        className
      )}
    >
      {/* aria-hidden — aria-label on the parent span carries the state */}
      <Icon
        className={cn("h-3.5 w-3.5 shrink-0", def.iconClass)}
        aria-hidden={true}
      />
      <span>{def.label}</span>
    </span>
  );
}
