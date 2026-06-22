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

  const handleAssign = () => {
    if (!selectedMemberId) return;
    setErrorKey(null);

    startTransition(async () => {
      const result = await assignMemberToLodging({
        itemId,
        tripMemberId: selectedMemberId,
        roomLabel: roomLabel.trim() || null,
      });

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
      const result = await removeLodgingAssignment(assignmentId);
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
              <span>
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

      {/* Assign form (organizer only) */}
      {isOrganizer ? (
        showForm ? (
          <div className="flex flex-col gap-2">
            <select
              value={selectedMemberId}
              onChange={(e) => setSelectedMemberId(e.target.value)}
              disabled={isPending}
              className={cn(
                "rounded-md border border-border bg-background px-3 py-1.5 text-sm",
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
                "rounded-md border border-border bg-background px-3 py-1.5 text-sm",
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
                  "rounded-full bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground",
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
