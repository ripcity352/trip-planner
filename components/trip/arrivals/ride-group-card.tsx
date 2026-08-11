"use client";

/**
 * RideGroupCard (#581) — the Full-view ride card: who's sharing a car at an
 * airport. Reuses the #574 provenance idea (an added rider shows "added by
 * X") but with NO confirm gesture — the only member action is opt-out
 * (`leave`). Any member can add riders (`addRidersToRide`); the creator or an
 * organizer can clear the whole ride (`deleteRideGroup`).
 *
 * "use client" — add/leave/remove mutate then call onMutated (router.refresh).
 */

import * as React from "react";
import { UserPlus } from "lucide-react";

import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { callAction } from "@/lib/ui/call-action";
import { resolveMemberName } from "@/lib/utils/member-display";
import {
  addRidersToRide,
  leaveRide,
  deleteRideGroup,
} from "@/lib/actions/ride-groups";
import type { RideGroupWithRiders, TripMember } from "@/lib/db/types";

/** A member who can still be added to a ride. */
export interface RideCandidate {
  id: string;
  name: string;
}

export interface RideGroupCardProps {
  ride: RideGroupWithRiders;
  myTripMemberId: string;
  memberNameMap: Map<string, TripMember>;
  /** Non-declined members not already on this ride, excluding the viewer. */
  addCandidates: ReadonlyArray<RideCandidate>;
  /** Viewer is the ride's creator or a trip organizer → may clear the ride. */
  canRemove: boolean;
  onMutated?: () => void;
}

function headingFor(ride: RideGroupWithRiders): string {
  const airport = ride.airport?.trim();
  if (ride.direction === "outbound") {
    return airport
      ? M3_UI_STRINGS.rideGroup_card_heading_outbound.replace("{airport}", airport)
      : M3_UI_STRINGS.rideGroup_card_heading_outbound_tbd;
  }
  return airport
    ? M3_UI_STRINGS.rideGroup_card_heading_inbound.replace("{airport}", airport)
    : M3_UI_STRINGS.rideGroup_card_heading_inbound_tbd;
}

export function RideGroupCard({
  ride,
  myTripMemberId,
  memberNameMap,
  addCandidates,
  canRemove,
  onMutated,
}: RideGroupCardProps) {
  const [addOpen, setAddOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<ReadonlyArray<string>>([]);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();

  // Stable idempotency key across retries; reset after a successful add so a
  // second distinct add isn't swallowed as a replay.
  const keyRef = React.useRef<string | null>(null);
  if (keyRef.current === null) keyRef.current = crypto.randomUUID();

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const runAdd = () => {
    if (selected.length === 0) return;
    setErrorKey(null);
    startTransition(async () => {
      const result = await callAction(() =>
        addRidersToRide(ride.id, [...selected], keyRef.current as string)
      );
      if (!result.ok) {
        setErrorKey(result.errorKey);
        return;
      }
      keyRef.current = crypto.randomUUID();
      setAddOpen(false);
      setSelected([]);
      onMutated?.();
    });
  };

  const runLeave = () => {
    setErrorKey(null);
    startTransition(async () => {
      const result = await callAction(() => leaveRide(ride.id));
      if (!result.ok) {
        setErrorKey(result.errorKey);
        return;
      }
      onMutated?.();
    });
  };

  const runRemove = () => {
    setErrorKey(null);
    startTransition(async () => {
      const result = await callAction(() => deleteRideGroup(ride.id));
      if (!result.ok) {
        setErrorKey(result.errorKey);
        return;
      }
      onMutated?.();
    });
  };

  const panelId = `ride-add-${ride.id}`;

  return (
    <div className="border-border flex flex-col gap-2 rounded-sm border p-3">
      <h3 className="text-sm font-medium lowercase">{headingFor(ride)}</h3>

      <ul className="flex flex-col gap-1">
        {ride.riders.map((rider) => {
          const isViewer = rider.trip_member_id === myTripMemberId;
          const name = isViewer
            ? M3_UI_STRINGS.rideGroup_self_label
            : resolveMemberName(memberNameMap, rider.trip_member_id);
          // Provenance: set + not self = "added by X" (permanent, quiet).
          const addedBy =
            rider.written_by_trip_member_id &&
            rider.written_by_trip_member_id !== rider.trip_member_id
              ? resolveMemberName(
                  memberNameMap,
                  rider.written_by_trip_member_id
                )
              : null;
          return (
            <li
              key={rider.trip_member_id}
              className="flex items-baseline justify-between gap-2 text-sm"
            >
              <span className="min-w-0 truncate">
                {name}
                {addedBy ? (
                  <span className="text-muted-foreground">
                    {" — "}
                    {M3_UI_STRINGS.rideGroup_added_by_template.replace(
                      "{name}",
                      addedBy
                    )}
                  </span>
                ) : null}
              </span>
              {isViewer ? (
                <button
                  type="button"
                  onClick={runLeave}
                  disabled={isPending}
                  className={cn(
                    "text-muted-foreground hover:text-foreground shrink-0 text-xs",
                    "focus-visible:ring-ring rounded-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                    "disabled:cursor-not-allowed disabled:opacity-60"
                  )}
                >
                  {M3_UI_STRINGS.rideGroup_leave}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
          {ERRORS[errorKey]}
        </p>
      ) : null}

      {/* Add riders — any member can add others onto this ride. */}
      {addOpen ? (
        <div id={panelId} className="flex flex-col gap-2">
          <fieldset className="flex flex-col gap-2">
            <legend className="text-foreground text-xs font-medium">
              {M3_UI_STRINGS.rideGroup_addRiders_label}
            </legend>
            <div className="flex flex-wrap gap-2">
              {addCandidates.map((c) => {
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={runAdd}
              disabled={isPending || selected.length === 0}
              className={cn(
                "focus-visible:ring-ring bg-primary text-primary-foreground h-9 rounded-xs px-4 text-sm font-medium",
                "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                "disabled:cursor-not-allowed disabled:opacity-60"
              )}
            >
              {M3_UI_STRINGS.rideGroup_addRiders_submit}
            </button>
            <button
              type="button"
              onClick={() => {
                setAddOpen(false);
                setSelected([]);
                setErrorKey(null);
              }}
              disabled={isPending}
              className="text-muted-foreground hover:text-foreground h-9 px-2 text-sm"
            >
              {M3_UI_STRINGS.rideGroup_cancel}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {addCandidates.length > 0 ? (
            <button
              type="button"
              aria-expanded={false}
              aria-controls={panelId}
              onClick={() => setAddOpen(true)}
              className={cn(
                "text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 self-start text-xs font-medium",
                "focus-visible:ring-ring rounded-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              )}
            >
              <UserPlus aria-hidden strokeWidth={1.75} className="h-3.5 w-3.5" />
              {M3_UI_STRINGS.rideGroup_addRiders_trigger}
            </button>
          ) : (
            <span />
          )}
          {canRemove ? (
            <button
              type="button"
              onClick={runRemove}
              disabled={isPending}
              className={cn(
                "text-muted-foreground hover:text-foreground shrink-0 text-xs",
                "focus-visible:ring-ring rounded-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                "disabled:cursor-not-allowed disabled:opacity-60"
              )}
            >
              {M3_UI_STRINGS.rideGroup_remove}
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
