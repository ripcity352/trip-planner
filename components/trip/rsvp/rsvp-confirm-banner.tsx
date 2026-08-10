"use client";

/**
 * RsvpConfirmBanner (#549) — the member-facing half of the organizer RSVP
 * confirm-prompt. An organizer relayed what the member told them offline
 * ("Dave heard you're in"); this banner lets the member confirm with their
 * OWN tap — the only thing that writes the real rsvp_status — or wave it off.
 *
 * Renders on the dashboard above the RSVP toggle, only when a pending ask
 * exists for the viewer. Confirm applies the proposed status (server reads
 * it from the DB, not the client); dismiss clears the ask untouched.
 */

import * as React from "react";

import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { RSVP_CONFIRM_PROMPT_UI_STRINGS as S } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import {
  confirmRsvpConfirmPromptAction,
  dismissRsvpConfirmPromptAction,
} from "@/lib/actions/rsvp-confirm-prompts";
import type { RsvpStatus } from "@/lib/db/types";

type ProposableStatus = Exclude<RsvpStatus, "pending">;

const HEADING_BY_STATUS: Record<ProposableStatus, string> = {
  going: S.rsvpPrompt_banner_going,
  maybe: S.rsvpPrompt_banner_maybe,
  declined: S.rsvpPrompt_banner_declined,
};

export interface RsvpConfirmBannerProps {
  tripId: string;
  proposedStatus: ProposableStatus;
  note: string | null;
  /** The sending organizer's display name, or null (falls back). */
  senderName: string | null;
}

export function RsvpConfirmBanner({
  tripId,
  proposedStatus,
  note,
  senderName,
}: RsvpConfirmBannerProps) {
  const [done, setDone] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();

  if (done) return null;

  const sender = senderName ?? S.rsvpPrompt_sender_fallback;
  const heading = HEADING_BY_STATUS[proposedStatus].replace("{sender}", sender);

  const run = (action: () => Promise<{ ok: boolean; errorKey?: ErrorKey }>) => {
    setErrorKey(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          setErrorKey(result.errorKey ?? "network");
          return;
        }
        setDone(true);
      } catch (err) {
        console.error("[rsvp-confirm-banner] action threw:", err);
        setErrorKey("network");
      }
    });
  };

  return (
    <div className="border-border bg-muted/40 flex flex-col gap-2 rounded-md border p-3">
      <p className="text-foreground text-sm font-medium">{heading}</p>
      {note ? (
        <p className="text-muted-foreground text-sm">
          {S.rsvpPrompt_note_template.replace("{note}", note)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            run(() =>
              confirmRsvpConfirmPromptAction(
                tripId,
                proposedStatus,
                crypto.randomUUID()
              )
            )
          }
          className={cn(
            "focus-visible:ring-ring rounded-xs border px-4 py-1.5 text-sm font-medium transition-colors",
            "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
            "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          {S.rsvpPrompt_confirm_cta}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            run(() => dismissRsvpConfirmPromptAction(tripId))
          }
          className={cn(
            "focus-visible:ring-ring rounded-xs border px-4 py-1.5 text-sm font-medium transition-colors",
            "border-border bg-background text-muted-foreground hover:bg-muted/60",
            "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          {S.rsvpPrompt_dismiss_cta}
        </button>
      </div>
      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
          {ERRORS[errorKey]}
        </p>
      ) : null}
    </div>
  );
}
