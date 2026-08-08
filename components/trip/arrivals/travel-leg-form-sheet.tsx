"use client";

/**
 * TravelLegFormSheet — toggle wrapper around TravelLegForm.
 *
 * Add mode (no `leg` prop): renders TWO CTAs (#477, relabeled #542) —
 * "Add a flight" (inbound) and "Add a return flight" (outbound). Tapping
 * one expands the form inline for that section. No actual Sheet primitive
 * needed — inline expansion at 375px is cleaner than a bottom sheet for
 * this surface.
 *
 * Edit mode (`leg` prop present): renders an "Edit" button per-leg that
 * expands the form pre-populated with the existing leg data; the section
 * is derived from `leg.direction` inside TravelLegForm.
 *
 * #525 — post-save suggestion: when the save implies day-chip changes
 * (deriveLegDaySuggestions), the sheet swaps to a one-question prompt.
 * Apply writes via setMemberDayAction; "Leave it" records the leg
 * version in localStorage so the identical save never re-asks. The
 * suggestion inputs (myDays + trip range) are optional props — mounts
 * that don't thread them simply never prompt.
 *
 * Server Component wrapping is impossible here because we need useState
 * for the open/closed toggle — this is a leaf client component.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import {
  deriveLegDaySuggestions,
  type LegDaySuggestions,
} from "@/lib/utils/leg-day-suggestions";
import { TravelLegForm } from "./travel-leg-form";
import { LegDaySuggestPrompt } from "./leg-day-suggest-prompt";
import type { MemberDay } from "@/lib/db/trip-member-days";
import type { TravelLeg, TravelLegDirection } from "@/lib/db/types";

export interface TravelLegFormSheetProps {
  tripId: string;
  /** Present for edit mode; omit for add mode. */
  leg?: TravelLeg;
  /** IANA timezone from `trips.timezone` — forwarded to TravelLegForm (#382). */
  tripTimezone: string;
  /** Called after a successful save or delete to trigger a page refresh. */
  onMutated?: () => void;
  /**
   * #525 — the VIEWER's own day rows + trip range. Optional: omit and
   * the post-save suggestion prompt never shows.
   */
  myDays?: ReadonlyArray<MemberDay>;
  tripStartsAt?: string | null;
  tripEndsAt?: string | null;
}

/**
 * "Same leg version" key (#525): id + direction + the two instants. A
 * dismissed prompt stays dismissed until the direction or a time
 * actually changes (a direction flip inverts the suggestion, so it
 * must re-ask).
 */
function suggestStorageKey(leg: TravelLeg): string {
  return `pt:legDaySuggest:${leg.id}:${leg.direction}:${leg.arrive_at ?? ""}:${leg.depart_at ?? ""}`;
}

function wasResolved(leg: TravelLeg): boolean {
  try {
    return window.localStorage.getItem(suggestStorageKey(leg)) === "1";
  } catch {
    return false;
  }
}

function markResolved(leg: TravelLeg): void {
  try {
    window.localStorage.setItem(suggestStorageKey(leg), "1");
  } catch {
    // Private-mode / quota failures just mean we might ask again.
  }
}

export function TravelLegFormSheet({
  tripId,
  leg,
  tripTimezone,
  onMutated,
  myDays,
  tripStartsAt,
  tripEndsAt,
}: TravelLegFormSheetProps) {
  // Add mode: which section's CTA opened the form; null = closed.
  // Edit mode: any non-null value opens (direction comes from the leg).
  const [openDirection, setOpenDirection] =
    React.useState<TravelLegDirection | null>(null);
  // #525 — pending post-save prompt (null = none).
  const [pendingSuggest, setPendingSuggest] = React.useState<{
    leg: TravelLeg;
    suggestions: LegDaySuggestions;
  } | null>(null);
  const isEditMode = !!leg;

  const handleSuccess = (savedLeg?: TravelLeg) => {
    setOpenDirection(null);
    onMutated?.();
    // Deletes (no savedLeg) and mounts without suggestion inputs skip
    // the prompt entirely.
    if (savedLeg && myDays && tripStartsAt && tripEndsAt) {
      if (!wasResolved(savedLeg)) {
        const suggestions = deriveLegDaySuggestions({
          leg: savedLeg,
          memberDays: myDays,
          tripStartsAt,
          tripEndsAt,
          timezone: tripTimezone,
        });
        if (suggestions) {
          setPendingSuggest({ leg: savedLeg, suggestions });
        }
      }
    }
  };

  const handleCancel = () => {
    setOpenDirection(null);
  };

  const handleSuggestDone = (applied: boolean) => {
    if (pendingSuggest) {
      // Applied or dismissed — either way this leg version is settled.
      markResolved(pendingSuggest.leg);
    }
    setPendingSuggest(null);
    if (applied) {
      onMutated?.();
    }
  };

  if (pendingSuggest) {
    return (
      <LegDaySuggestPrompt
        tripId={tripId}
        suggestions={pendingSuggest.suggestions}
        onDone={handleSuggestDone}
      />
    );
  }

  if (openDirection) {
    return (
      <div className="rounded-md border border-border bg-card px-4 py-4">
        <TravelLegForm
          tripId={tripId}
          leg={leg}
          direction={openDirection}
          tripTimezone={tripTimezone}
          onSuccess={handleSuccess}
          onCancel={handleCancel}
        />
      </div>
    );
  }

  if (isEditMode) {
    return (
      <button
        type="button"
        onClick={() => setOpenDirection(leg.direction)}
        className={cn(
          "focus-visible:ring-ring h-8 rounded-xs border border-border bg-muted px-3 text-xs font-medium text-muted-foreground",
          "hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        )}
      >
        {M3_UI_STRINGS.arrivals_edit_cta}
      </button>
    );
  }

  // #477: the add flow starts from two section CTAs.
  return (
    <div className="flex gap-3">
      <button
        type="button"
        onClick={() => setOpenDirection("inbound")}
        className={cn(
          "focus-visible:ring-ring h-11 flex-1 rounded-xs bg-primary px-4 text-sm font-medium text-primary-foreground",
          "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
          "hover:bg-primary/90"
        )}
      >
        {M3_UI_STRINGS.arrivals_add_inbound_cta}
      </button>
      <button
        type="button"
        onClick={() => setOpenDirection("outbound")}
        className={cn(
          "focus-visible:ring-ring h-11 flex-1 rounded-xs border border-border bg-muted px-4 text-sm font-medium text-muted-foreground",
          "hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        )}
      >
        {M3_UI_STRINGS.arrivals_add_outbound_cta}
      </button>
    </div>
  );
}
