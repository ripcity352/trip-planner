"use client";

/**
 * CrewFlightPanel (#574 follow-up) — collapsible trigger + CrewFlightForm.
 * Self-contained: owns its open state and its own router.refresh, so it can
 * be dropped onto any server page (arrivals, roster) without threading a
 * refresh callback. Any trip member sees it (not organizer-gated).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import {
  CrewFlightForm,
  type CrewFlightCandidate,
} from "./crew-flight-form";

export interface CrewFlightPanelProps {
  tripId: string;
  tripTimezone: string;
  viewerTripMemberId: string;
  candidates: ReadonlyArray<CrewFlightCandidate>;
}

export function CrewFlightPanel({
  tripId,
  tripTimezone,
  viewerTripMemberId,
  candidates,
}: CrewFlightPanelProps) {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();

  // The panel's job is logging a flight for OTHERS — if the only candidate
  // is you (or there are none), you'd use the normal add-a-flight flow, so
  // hide it entirely rather than offer a redundant self-only surface.
  if (!candidates.some((c) => !c.isYou)) return null;

  const panelId = `crew-flight-${tripId}`;

  const handleDone = (didWrite: boolean) => {
    setOpen(false);
    if (didWrite) router.refresh();
  };

  return (
    <div className="mt-4 flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "text-foreground flex items-center gap-1.5 self-start text-sm font-medium",
          "focus-visible:ring-ring rounded-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        )}
      >
        {M3_UI_STRINGS.crewFlight_trigger}
        <ChevronDown
          aria-hidden
          strokeWidth={1.75}
          className={cn(
            "h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none",
            open && "rotate-180"
          )}
        />
      </button>

      {open ? (
        <div
          id={panelId}
          className="border-border bg-card rounded-md border px-4 py-4"
        >
          <CrewFlightForm
            tripId={tripId}
            tripTimezone={tripTimezone}
            viewerTripMemberId={viewerTripMemberId}
            candidates={candidates}
            onDone={handleDone}
          />
        </div>
      ) : null}
    </div>
  );
}
