"use client";

/**
 * OrganizerFlagOnBehalf — the organizer-side entry point for #171.
 *
 * Lets an organizer transcribe a participation heads-up a member
 * volunteered out-of-band ("Marcus DM'd his shellfish allergy"). The row
 * is attributed to the organizer (written_by) and the member gets a
 * keep/remove say on their own item view — recording, not assuming (see
 * the persona-edge-attendees master principle).
 *
 * Organizer-only surface: item-card renders this only for organizers, and
 * `addItemFlagOnBehalf` re-checks `is_trip_organizer` server-side AND in
 * RLS (rule #11 — the gate is server-side; the UI just never offers the
 * affordance to non-organizers). The target picker excludes the organizer
 * themselves (the self path is the normal picker) and trip-level decliners.
 */

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { callAction } from "@/lib/ui/call-action";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { addItemFlagOnBehalf } from "@/lib/actions/item-flags";
import { resolveMemberName } from "@/lib/utils/member-display";
import type { TripMember } from "@/lib/db/types";

const FLAG_MAX = 100;
const NOTE_MAX = 500;

/** Strip NUL bytes and CR/LF control characters; trim; cap at maxLen. */
function sanitize(value: string, maxLen: number): string {
  return value
    .replace(/\0/g, "")
    .replace(/[\r\n]/g, "")
    .trim()
    .slice(0, maxLen);
}

export interface OrganizerFlagOnBehalfProps {
  itemId: string;
  tripMembers: TripMember[];
  /** The organizer's own trip_member_id — excluded from the target picker. */
  viewerMemberId: string;
}

export function OrganizerFlagOnBehalf({
  itemId,
  tripMembers,
  viewerMemberId,
}: OrganizerFlagOnBehalfProps) {
  const [open, setOpen] = React.useState(false);
  const [targetId, setTargetId] = React.useState("");
  const [flag, setFlag] = React.useState("");
  const [note, setNote] = React.useState("");
  const [savedForName, setSavedForName] = React.useState<string | null>(null);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const memberMap = React.useMemo(
    () => new Map(tripMembers.map((m) => [m.id, m])),
    [tripMembers]
  );

  // Targets: everyone but the organizer themselves (self uses the normal
  // picker) and trip-level decliners (#475 — out of the trip, no heads-up).
  const targets = React.useMemo(
    () =>
      tripMembers
        .filter((m) => m.id !== viewerMemberId && m.rsvp_status !== "declined")
        .map((m) => ({ id: m.id, name: resolveMemberName(memberMap, m.id) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [tripMembers, viewerMemberId, memberMap]
  );

  const panelId = `flag-onbehalf-${itemId}`;

  if (targets.length === 0) {
    return null;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanFlag = sanitize(flag, FLAG_MAX);
    const cleanNote = sanitize(note, NOTE_MAX) || null;
    if (!targetId || !cleanFlag) return;

    setErrorKey(null);
    setSavedForName(null);

    startTransition(async () => {
      const result = await callAction(() =>
        addItemFlagOnBehalf({
          itemId,
          targetTripMemberId: targetId,
          flag: cleanFlag,
          note: cleanNote,
        })
      );

      if (!result.ok) {
        setErrorKey(result.errorKey);
        return;
      }

      setSavedForName(resolveMemberName(memberMap, targetId));
      setTargetId("");
      setFlag("");
      setNote("");
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "text-muted-foreground flex items-center gap-1.5 self-start text-xs font-medium",
          "focus-visible:ring-ring rounded-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        )}
      >
        {M3_UI_STRINGS.itinerary_item_flag_onbehalf_add_trigger}
        <ChevronDown
          aria-hidden
          strokeWidth={1.75}
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none",
            open && "rotate-180"
          )}
        />
      </button>

      {open ? (
        <form
          id={panelId}
          onSubmit={handleSubmit}
          className="flex flex-col gap-2"
        >
          <select
            value={targetId}
            onChange={(e) => {
              setTargetId(e.target.value);
              setSavedForName(null);
            }}
            disabled={isPending}
            aria-label={M3_UI_STRINGS.itinerary_item_flag_onbehalf_pick_person}
            className={cn(
              "border-border bg-background rounded-xs border px-3 py-1.5 text-sm",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            )}
          >
            <option value="">
              {M3_UI_STRINGS.itinerary_item_flag_onbehalf_pick_person}
            </option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={flag}
            onChange={(e) => {
              setFlag(sanitize(e.target.value, FLAG_MAX));
              setSavedForName(null);
            }}
            placeholder={M3_UI_STRINGS.itinerary_item_flag_placeholder}
            maxLength={FLAG_MAX}
            disabled={isPending}
            className={cn(
              "border-border bg-background rounded-xs border px-3 py-1.5 text-sm",
              "placeholder:text-muted-foreground",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-60"
            )}
          />

          <textarea
            value={note}
            onChange={(e) => {
              setNote(sanitize(e.target.value, NOTE_MAX));
              setSavedForName(null);
            }}
            placeholder={M3_UI_STRINGS.itinerary_item_flag_note_placeholder}
            maxLength={NOTE_MAX}
            rows={2}
            disabled={isPending}
            className={cn(
              "border-border bg-background resize-none rounded-xs border px-3 py-1.5 text-sm",
              "placeholder:text-muted-foreground",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-60"
            )}
          />

          <button
            type="submit"
            disabled={isPending || !targetId || !flag.trim()}
            className={cn(
              "focus-visible:ring-ring self-start rounded-xs border px-4 py-1.5 text-xs font-medium transition-colors",
              "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-60",
              "border-border bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {M3_UI_STRINGS.itinerary_item_flag_onbehalf_save}
          </button>

          {savedForName ? (
            <p className="text-muted-foreground text-xs">
              {M3_UI_STRINGS.itinerary_item_flag_onbehalf_saved_template.replace(
                "{name}",
                savedForName
              )}
            </p>
          ) : null}

          {errorKey ? (
            <p role="alert" className={cn(ERROR_LINE_CLASS, "text-xs")}>
              {ERRORS[errorKey]}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}
