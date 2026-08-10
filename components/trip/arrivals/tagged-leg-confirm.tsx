"use client";

/**
 * TaggedLegConfirm (#574) — the tagged member's confirm/dismiss control for
 * a pending co-traveler tag. Someone who logged a shared flight tagged this
 * member onto it; the leg is attributed (`written_by_trip_member_id`) and
 * pending until the member acts.
 *
 * Renders inline on the member's OWN travel-leg card (only when the viewer
 * is the tagged member). "Yep, that's me" adopts the leg (clears attribution
 * via confirmTaggedLeg); "Not me" removes it (deleteTravelLeg — a pending tag
 * is the member's own row, so the existing owner-only delete covers it).
 *
 * Both routes are the member's OWN tap — the only thing that turns a tag into
 * a confirmed leg (rule #8: opt-in, never silently assumed).
 */

import * as React from "react";

import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { confirmTaggedLeg, deleteTravelLeg } from "@/lib/actions/travel-legs";
import { callAction, type ActionResult } from "@/lib/ui/call-action";

export interface TaggedLegConfirmProps {
  legId: string;
  /** Display name of the member who added the tag (the tagger). */
  taggerName: string;
  /** Refreshes the manifest after a confirm/dismiss (router.refresh). */
  onResolved?: () => void;
}

export function TaggedLegConfirm({
  legId,
  taggerName,
  onResolved,
}: TaggedLegConfirmProps) {
  const [done, setDone] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();

  if (done) return null;

  const heading = M3_UI_STRINGS.arrivals_tag_confirm_heading_template.replace(
    "{name}",
    taggerName
  );

  const run = (action: () => Promise<ActionResult>) => {
    setErrorKey(null);
    startTransition(async () => {
      // #431: rejected awaits resolve to the network envelope via callAction.
      const result = await callAction(action);
      if (!result.ok) {
        setErrorKey(result.errorKey);
        return;
      }
      setDone(true);
      onResolved?.();
    });
  };

  return (
    <div className="border-border bg-muted/40 mt-1 flex flex-col gap-2 rounded-md border p-3">
      <p className="text-foreground text-sm font-medium">{heading}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => confirmTaggedLeg(legId))}
          className={cn(
            "focus-visible:ring-ring rounded-xs border px-4 py-1.5 text-sm font-medium transition-colors",
            "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
            "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          {M3_UI_STRINGS.arrivals_tag_confirm_cta}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => run(() => deleteTravelLeg(legId))}
          className={cn(
            "focus-visible:ring-ring rounded-xs border px-4 py-1.5 text-sm font-medium transition-colors",
            "border-border bg-background text-muted-foreground hover:bg-muted/60",
            "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        >
          {M3_UI_STRINGS.arrivals_tag_dismiss_cta}
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
