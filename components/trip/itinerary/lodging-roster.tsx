"use client";

/**
 * LodgingRoster — room assignment UI inside a lodging item card (#36).
 *
 * Client Component because of the assign form state. Reads assignments
 * as a prop (fetched server-side by the parent). Organizer CAN assign
 * and unassign; non-organizers see the list read-only.
 *
 * Lookup: tripMembers prop is needed to display names alongside assignments
 * (lodging_assignments only stores trip_member_id).
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { callAction } from "@/lib/ui/call-action";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import {
  assignMemberToLodging,
  removeLodgingAssignment,
} from "@/lib/actions/lodging-assignments";
import { resolveMemberName } from "@/lib/utils/member-display";
import type { LodgingAssignment, TripMember } from "@/lib/db/types";

export interface LodgingRosterProps {
  itemId: string;
  assignments: LodgingAssignment[];
  tripMembers: TripMember[];
  isOrganizer: boolean;
}

export function LodgingRoster({
  itemId,
  assignments: initialAssignments,
  tripMembers,
  isOrganizer,
}: LodgingRosterProps) {
  const [assignments, setAssignments] =
    React.useState<LodgingAssignment[]>(initialAssignments);
  const [showForm, setShowForm] = React.useState(false);
  const [selectedMemberId, setSelectedMemberId] = React.useState("");
  const [roomLabel, setRoomLabel] = React.useState("");
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();

  // Map keyed by trip_member_id → TripMember. resolveMemberName reads
  // display_name and falls back to "Guest" — email/id never surface in the UI.
  const memberMap = React.useMemo(
    () => new Map(tripMembers.map((m) => [m.id, m])),
    [tripMembers]
  );

  // Members not yet assigned
  const assignedMemberIds = new Set(assignments.map((a) => a.trip_member_id));
  const unassignedMembers = tripMembers.filter(
    (m) => !assignedMemberIds.has(m.id)
  );

  // #556 — organizer-only "No room yet" bucket. Names an absence explicitly
  // (rule #8) so an omitted member never reads as "handled." Distinct from the
  // assign dropdown above: trip-level decliners are dropped (#475 — a member
  // who's out of the trip doesn't "need a room"), and the order is alphabetical
  // by resolved name (never by join order or lateness — #169 anti-ranking).
  const unassignedForDisplay = unassignedMembers
    .filter((m) => m.rsvp_status !== "declined")
    .map((m) => ({ id: m.id, name: resolveMemberName(memberMap, m.id) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleAssign = () => {
    if (!selectedMemberId) return;
    setErrorKey(null);

    startTransition(async () => {
      // #431: rejected awaits resolve to the network envelope via callAction.
      const result = await callAction(() =>
        assignMemberToLodging({
          itemId,
          tripMemberId: selectedMemberId,
          roomLabel: roomLabel.trim() || null,
        })
      );

      if (!result.ok) {
        setErrorKey(result.errorKey);
        return;
      }

      setAssignments((prev) => {
        const without = prev.filter(
          (a) => a.trip_member_id !== selectedMemberId
        );
        return [...without, result.assignment];
      });
      setSelectedMemberId("");
      setRoomLabel("");
      setShowForm(false);
    });
  };

  const handleUnassign = (assignmentId: string) => {
    setErrorKey(null);

    startTransition(async () => {
      const result = await callAction(() =>
        removeLodgingAssignment(assignmentId)
      );
      if (!result.ok) {
        setErrorKey(result.errorKey);
        return;
      }
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId));
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
        {M3_UI_STRINGS.lodging_assignments_heading}
      </h4>

      {/* Assignment list */}
      {assignments.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {assignments.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="min-w-0 truncate">
                {resolveMemberName(memberMap, a.trip_member_id)}
                {a.room_label ? (
                  <span className="text-muted-foreground"> · {a.room_label}</span>
                ) : null}
              </span>
              {isOrganizer ? (
                <button
                  type="button"
                  onClick={() => handleUnassign(a.id)}
                  disabled={isPending}
                  className={cn(
                    "text-muted-foreground hover:text-destructive text-xs underline-offset-2 hover:underline",
                    "disabled:cursor-not-allowed disabled:opacity-60"
                  )}
                >
                  {M3_UI_STRINGS.lodging_unassign_cta}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {/* #556 — organizer-only "No room yet" bucket. Read-side surfacing of
          the absence; no count in the heading, no blocking framing, alphabetical
          order. Hidden entirely from non-organizers (anti-shame, #387). */}
      {isOrganizer && unassignedForDisplay.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <h5 className="text-muted-foreground text-xs font-medium uppercase tracking-wide">
            {M3_UI_STRINGS.lodging_unassigned_heading}
          </h5>
          <ul className="flex flex-col gap-1">
            {unassignedForDisplay.map((m) => (
              <li
                key={m.id}
                data-testid="lodging-unassigned-member"
                className="text-muted-foreground min-w-0 truncate text-sm"
              >
                {m.name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Assign form (organizer only) */}
      {isOrganizer ? (
        showForm ? (
          <div className="flex flex-col gap-2">
            <select
              value={selectedMemberId}
              onChange={(e) => setSelectedMemberId(e.target.value)}
              disabled={isPending}
              className={cn(
                "rounded-xs border border-border bg-background px-3 py-1.5 text-sm",
                "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              )}
            >
              <option value="">{M3_UI_STRINGS.lodging_assign_pick_person}</option>
              {unassignedMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {/* Organizer-only dropdown: keep email fallback so two unnamed
                   * members don't both render as identical "Guest" options.
                   * Display sites use resolveMemberName (no email exposure). */}
                  {m.display_name ?? m.email ?? M3_UI_STRINGS.roster_member_fallback_name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={roomLabel}
              onChange={(e) => setRoomLabel(e.target.value)}
              placeholder={M3_UI_STRINGS.lodging_room_label_placeholder}
              maxLength={100}
              disabled={isPending}
              className={cn(
                "rounded-xs border border-border bg-background px-3 py-1.5 text-sm",
                "placeholder:text-muted-foreground",
                "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
              )}
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAssign}
                disabled={isPending || !selectedMemberId}
                className={cn(
                  "rounded-xs bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground",
                  "disabled:cursor-not-allowed disabled:opacity-60"
                )}
              >
                {M3_UI_STRINGS.lodging_assign_cta}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setSelectedMemberId("");
                  setRoomLabel("");
                }}
                disabled={isPending}
                className="text-muted-foreground text-xs underline-offset-2 hover:underline"
              >
                {M3_UI_STRINGS.itineraryForm_cancel}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className={cn(
              "text-primary self-start text-xs underline-offset-2 hover:underline",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            )}
          >
            {M3_UI_STRINGS.lodging_assign_cta}
          </button>
        )
      ) : null}

      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-xs")}>
          {ERRORS[errorKey]}
        </p>
      ) : null}
    </div>
  );
}
