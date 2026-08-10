"use client";

/**
 * AddToFlight (#574 follow-up) — the intuitive way to say "these people are
 * on this flight too": a control on an already-logged flight CARD that adds
 * the members you pick straight onto that flight. The flight's own details
 * (airline, number, time, airport) are reused — no re-entering anything.
 *
 * Any trip member can add others to any flight card (not just the owner) —
 * the person who knows who's on it usually isn't the one who logged it. Each
 * added member gets a pending, ATTRIBUTED leg they confirm on their own
 * arrivals view (rule #8), so this can never silently assert someone's travel.
 * Reuses tagCoTravelersAction — no PNR/notes copied (#505).
 */

import * as React from "react";
import { UserPlus } from "lucide-react";

import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { callAction } from "@/lib/ui/call-action";
import { tagCoTravelersAction } from "@/lib/actions/travel-legs";
import type { TravelLeg } from "@/lib/db/types";

/** A member who can still be added to a given flight. */
export interface AddToFlightCandidate {
  /** trip_member_id. */
  id: string;
  name: string;
}

export interface AddToFlightProps {
  /** The flight to add people to — its facts are copied onto each new leg. */
  leg: TravelLeg;
  /** Members not already on this flight (server-composed). */
  candidates: ReadonlyArray<AddToFlightCandidate>;
  /** Refreshes the manifest after a successful add (router.refresh). */
  onAdded?: () => void;
}

export function AddToFlight({ leg, candidates, onAdded }: AddToFlightProps) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<ReadonlyArray<string>>([]);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();

  // Stable idempotency key across retries so a re-tap replays rather than
  // duplicating the fan-out (lazy — crypto is client-only).
  const keyRef = React.useRef<string | null>(null);
  if (keyRef.current === null) keyRef.current = crypto.randomUUID();

  if (candidates.length === 0) return null;

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const submit = () => {
    if (selected.length === 0) return;
    setErrorKey(null);
    startTransition(async () => {
      const result = await callAction(() =>
        tagCoTravelersAction(
          {
            tripId: leg.trip_id,
            targetTripMemberIds: [...selected],
            kind: "flight",
            // The flight's own facts — copied, never re-typed.
            direction: leg.direction,
            departAt: leg.depart_at,
            arriveAt: leg.arrive_at,
            airport: leg.airport,
            // Inbound-only "from HNL"; the action ignores it for outbound.
            originLabel: leg.origin_label,
            carrier: leg.carrier,
            airlineIata: leg.airline_iata ?? null,
            flightNumber: leg.flight_number ?? null,
          },
          keyRef.current as string
        )
      );
      if (!result.ok) {
        setErrorKey(result.errorKey);
        return;
      }
      setOpen(false);
      setSelected([]);
      onAdded?.();
    });
  };

  const panelId = `add-to-flight-${leg.id}`;

  if (!open) {
    return (
      <button
        type="button"
        aria-expanded={false}
        aria-controls={panelId}
        onClick={() => setOpen(true)}
        className={cn(
          "text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 self-start text-xs font-medium",
          "focus-visible:ring-ring rounded-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        )}
      >
        <UserPlus aria-hidden strokeWidth={1.75} className="h-3.5 w-3.5" />
        {M3_UI_STRINGS.addToFlight_trigger}
      </button>
    );
  }

  return (
    <div id={panelId} className="flex flex-col gap-2">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-foreground text-xs font-medium">
          {M3_UI_STRINGS.addToFlight_label}
        </legend>
        <div className="flex flex-wrap gap-2">
          {candidates.map((c) => {
            const checked = selected.includes(c.id);
            return (
              <label
                key={c.id}
                className={cn(
                  "focus-within:ring-ring inline-flex cursor-pointer items-center gap-2 rounded-xs border px-3 py-1 text-sm",
                  "focus-within:ring-2 focus-within:ring-offset-2",
                  checked
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground",
                  isPending && "cursor-not-allowed opacity-60"
                )}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={checked}
                  disabled={isPending}
                  onChange={() => toggle(c.id)}
                />
                {c.name}
              </label>
            );
          })}
        </div>
      </fieldset>

      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
          {ERRORS[errorKey]}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={isPending || selected.length === 0}
          className={cn(
            "focus-visible:ring-ring h-9 rounded-xs bg-primary px-4 text-sm font-medium text-primary-foreground",
            "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          {M3_UI_STRINGS.addToFlight_submit}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setSelected([]);
            setErrorKey(null);
          }}
          disabled={isPending}
          className={cn(
            "focus-visible:ring-ring h-9 rounded-xs border border-border bg-muted px-4 text-sm font-medium text-muted-foreground",
            "hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          {M3_UI_STRINGS.addToFlight_cancel}
        </button>
      </div>
    </div>
  );
}
