"use client";

/**
 * ItemFlagForm — per-item dietary/participation flag entry (#80).
 *
 * Members submit a freeform flag text (e.g. "vegan", "sober", "leaving
 * early") that is ONLY visible to organizers. The member sees no
 * confirmation read-back — just "saved" or "failed" per the RLS/ADR.
 *
 * The `flag` field is freeform text, not an enum, per CLAUDE.md rule #8:
 * "don't encode a default — non-default attendees opt INTO participation."
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { addItemFlag } from "@/lib/actions/item-flags";

export interface ItemFlagFormProps {
  itemId: string;
  className?: string;
}

export function ItemFlagForm({ itemId, className }: ItemFlagFormProps) {
  const [flag, setFlag] = React.useState("");
  const [note, setNote] = React.useState("");
  const [saved, setSaved] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = flag.trim();
    if (!trimmed) return;

    setErrorKey(null);
    setSaved(false);

    startTransition(async () => {
      try {
        const result = await addItemFlag({
          itemId,
          flag: trimmed,
          note: note.trim() || null,
        });

        if (!result.ok) {
          setErrorKey(result.errorKey);
          return;
        }

        setSaved(true);
        setFlag("");
        setNote("");
      } catch (err) {
        console.error("[item-flag-form] addItemFlag threw:", err);
        setErrorKey("network");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className={cn("flex flex-col gap-2", className)}>
      <label
        className="text-muted-foreground text-xs font-medium"
        htmlFor={`flag-${itemId}`}
      >
        {M3_UI_STRINGS.itinerary_item_flag_label}
      </label>
      <input
        id={`flag-${itemId}`}
        type="text"
        value={flag}
        onChange={(e) => {
          setFlag(e.target.value);
          setSaved(false);
        }}
        placeholder={M3_UI_STRINGS.itinerary_item_flag_placeholder}
        maxLength={100}
        disabled={isPending}
        className={cn(
          "rounded-md border border-border bg-background px-3 py-1.5 text-sm",
          "placeholder:text-muted-foreground",
          "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-60"
        )}
      />
      <button
        type="submit"
        disabled={isPending || !flag.trim()}
        className={cn(
          "focus-visible:ring-ring self-start rounded-full border px-4 py-1.5 text-xs font-medium transition-colors",
          "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-60",
          "border-border bg-muted text-muted-foreground hover:bg-muted/80"
        )}
      >
        {M3_UI_STRINGS.itinerary_item_flag_save}
      </button>
      {saved ? (
        <p className="text-muted-foreground text-xs">Saved.</p>
      ) : null}
      {errorKey ? (
        <p role="alert" className="text-destructive text-xs">
          {ERRORS[errorKey]}
        </p>
      ) : null}
    </form>
  );
}
