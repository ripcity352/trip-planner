"use client";

/**
 * RsvpConfirmPromptSender (#549) — the organizer-side surface for sending a
 * member an RSVP confirm-prompt ("I heard Rob's in — ask him to confirm").
 * The organizer NEVER writes rsvp_status; this sends a pending ask the
 * member confirms with their own tap. Organizer-only (roster renders it for
 * organizers; the action re-checks is_trip_organizer server-side + RLS).
 *
 * Collapsible, mirrors OrganizerMemberDaysPanel: pick a member, pick what
 * you heard, optional note, send. A member who already has a pending ask is
 * shown with a cue in the picker (replace-not-stack — sending again just
 * updates their one ask).
 */

import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { RSVP_CONFIRM_PROMPT_UI_STRINGS as S } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { sendRsvpConfirmPromptAction } from "@/lib/actions/rsvp-confirm-prompts";
import type { RsvpStatus } from "@/lib/db/types";

type ProposableStatus = Exclude<RsvpStatus, "pending">;

const STATUS_OPTIONS: ReadonlyArray<{ value: ProposableStatus; label: string }> = [
  { value: "going", label: S.rsvpPrompt_send_status_going },
  { value: "maybe", label: S.rsvpPrompt_send_status_maybe },
  { value: "declined", label: S.rsvpPrompt_send_status_declined },
];

const NOTE_MAX = 500;

/** A member an organizer may send a confirm-prompt to. */
export interface RsvpPromptTarget {
  /** trip_member_id of the target. */
  id: string;
  name: string;
  /** The status they were already asked to confirm, if a prompt is pending. */
  alreadyAsked: ProposableStatus | null;
}

export interface RsvpConfirmPromptSenderProps {
  tripId: string;
  targets: ReadonlyArray<RsvpPromptTarget>;
}

function sanitize(value: string): string {
  return value.replace(/\0/g, "").replace(/[\r\n]+/g, " ").slice(0, NOTE_MAX);
}

export function RsvpConfirmPromptSender({
  tripId,
  targets,
}: RsvpConfirmPromptSenderProps) {
  const [open, setOpen] = React.useState(false);
  const [targetId, setTargetId] = React.useState("");
  const [status, setStatus] = React.useState<ProposableStatus>("going");
  const [note, setNote] = React.useState("");
  const [sentName, setSentName] = React.useState<string | null>(null);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const panelId = `rsvp-confirm-send-${tripId}`;

  if (targets.length === 0) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetId) return;
    const cleanNote = sanitize(note).trim() || null;
    const targetName = targets.find((t) => t.id === targetId)?.name ?? "";

    setErrorKey(null);
    setSentName(null);

    startTransition(async () => {
      try {
        const result = await sendRsvpConfirmPromptAction(
          { tripId, targetTripMemberId: targetId, proposedStatus: status, note: cleanNote },
          crypto.randomUUID()
        );
        if (!result.ok) {
          setErrorKey(result.errorKey);
          return;
        }
        setSentName(targetName);
        setTargetId("");
        setStatus("going");
        setNote("");
      } catch (err) {
        console.error("[rsvp-confirm-sender] action threw:", err);
        setErrorKey("network");
      }
    });
  };

  return (
    <div className="mt-6 flex flex-col gap-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "text-muted-foreground flex items-center gap-1.5 self-start text-sm font-medium",
          "focus-visible:ring-ring rounded-xs focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        )}
      >
        {S.rsvpPrompt_send_trigger}
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
        <form id={panelId} onSubmit={handleSubmit} className="flex flex-col gap-2">
          <select
            value={targetId}
            onChange={(e) => {
              setTargetId(e.target.value);
              setSentName(null);
            }}
            disabled={isPending}
            aria-label={S.rsvpPrompt_send_pick_person}
            className={cn(
              "border-border bg-background rounded-xs border px-3 py-1.5 text-sm",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            )}
          >
            <option value="">{S.rsvpPrompt_send_pick_person}</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.alreadyAsked ? `${t.name} · asked` : t.name}
              </option>
            ))}
          </select>

          <label
            htmlFor={`${panelId}-status`}
            className="text-muted-foreground text-xs font-medium"
          >
            {S.rsvpPrompt_send_status_label}
          </label>
          <select
            id={`${panelId}-status`}
            value={status}
            onChange={(e) => setStatus(e.target.value as ProposableStatus)}
            disabled={isPending}
            className={cn(
              "border-border bg-background rounded-xs border px-3 py-1.5 text-sm",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            )}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>

          <textarea
            value={note}
            onChange={(e) => setNote(sanitize(e.target.value))}
            placeholder={S.rsvpPrompt_send_note_placeholder}
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
            disabled={isPending || !targetId}
            className={cn(
              "focus-visible:ring-ring self-start rounded-xs border px-4 py-1.5 text-xs font-medium transition-colors",
              "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-60",
              "border-border bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {S.rsvpPrompt_send_cta}
          </button>

          <p className="text-muted-foreground text-xs">{S.rsvpPrompt_send_hint}</p>

          {sentName ? (
            <p className="text-muted-foreground text-xs">
              {S.rsvpPrompt_send_sent_template.replace("{name}", sentName)}
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
