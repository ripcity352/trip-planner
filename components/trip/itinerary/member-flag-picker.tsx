"use client";

/**
 * MemberFlagPicker — per-item member flag chip picker (#165, M4 W1c).
 *
 * Voice locks (Phase 2 Override H):
 *   - Heading: M4_UI_STRINGS.itineraryItem_memberFlag_heading
 *   - Subhead: M4_UI_STRINGS.itineraryItem_memberFlag_subhead
 *
 * Voice CRITICAL C8: NO "organizers notified" phrasing anywhere.
 * Confirmation is a silent "Saved." only.
 *
 * Chips from MEMBER_FLAG_CHIPS (W0a locked — do not inline here).
 * Server actions from lib/actions/item-flags.ts (M3 — addItemFlag / removeItemFlag).
 *
 * Injection defenses (Coverage HIGH H1):
 *   - flag: stripped of NUL + CRLF, capped at 100 chars
 *   - note: stripped of NUL + CRLF, capped at 500 chars
 * The server action (Zod schema) is the final gate; the client rejects
 * before submit as defense-in-depth.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { M3_UI_STRINGS, M4_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { MEMBER_FLAG_CHIPS } from "@/lib/data/member-flags";
import { addItemFlag, removeItemFlag } from "@/lib/actions/item-flags";

// ─── Constants ────────────────────────────────────────────────────────────────

const FLAG_MAX = 100;
const NOTE_MAX = 500;

// ─── Sanitizers ───────────────────────────────────────────────────────────────

/** Strip NUL bytes and CR/LF control characters; trim; cap at maxLen. */
function sanitize(value: string, maxLen: number): string {
  return value
    .replace(/\0/g, "")
    .replace(/[\r\n]/g, "")
    .trim()
    .slice(0, maxLen);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MemberFlagPickerProps {
  itemId: string;
  /** Pre-selected chip values (e.g. loaded from server). */
  initialFlags?: ReadonlyArray<string>;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MemberFlagPicker({
  itemId,
  initialFlags = [],
  className,
}: MemberFlagPickerProps) {
  const [selected, setSelected] = React.useState<Set<string>>(
    new Set(initialFlags)
  );
  const [freeformFlag, setFreeformFlag] = React.useState("");
  const [note, setNote] = React.useState("");
  const [saved, setSaved] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();

  // ── Chip toggle ─────────────────────────────────────────────────────────────

  const toggleChip = (chip: string) => {
    const isSelected = selected.has(chip);

    setErrorKey(null);
    setSaved(false);

    if (isSelected) {
      startTransition(async () => {
        try {
          const result = await removeItemFlag(itemId, chip);
          if (!result.ok) {
            setErrorKey(result.errorKey);
            return;
          }
          setSelected((prev) => {
            const next = new Set(prev);
            next.delete(chip);
            return next;
          });
          setSaved(true);
        } catch {
          setErrorKey("network");
        }
      });
    } else {
      startTransition(async () => {
        try {
          const result = await addItemFlag({ itemId, flag: chip });
          if (!result.ok) {
            setErrorKey(result.errorKey);
            return;
          }
          setSelected((prev) => new Set([...prev, chip]));
          setSaved(true);
        } catch {
          setErrorKey("network");
        }
      });
    }
  };

  // ── Freeform submit ─────────────────────────────────────────────────────────

  const handleFreeformSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const cleanFlag = sanitize(freeformFlag, FLAG_MAX);
    const cleanNote = sanitize(note, NOTE_MAX) || null;

    if (!cleanFlag) return;

    setErrorKey(null);
    setSaved(false);

    startTransition(async () => {
      try {
        const result = await addItemFlag({
          itemId,
          flag: cleanFlag,
          note: cleanNote,
        });

        if (!result.ok) {
          setErrorKey(result.errorKey);
          return;
        }

        setFreeformFlag("");
        setNote("");
        setSaved(true);
      } catch {
        setErrorKey("network");
      }
    });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Voice-locked heading + subhead */}
      <div>
        <p className="text-sm font-semibold">
          {M4_UI_STRINGS.itineraryItem_memberFlag_heading}
        </p>
        <p className="text-muted-foreground text-xs">
          {M4_UI_STRINGS.itineraryItem_memberFlag_subhead}
        </p>
      </div>

      {/* Chip grid */}
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={M4_UI_STRINGS.itineraryItem_memberFlag_heading}
      >
        {MEMBER_FLAG_CHIPS.map((chip) => {
          const isChipSelected = selected.has(chip);
          return (
            <button
              key={chip}
              type="button"
              role="button"
              aria-pressed={isChipSelected}
              disabled={isPending}
              onClick={() => toggleChip(chip)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                "disabled:cursor-not-allowed disabled:opacity-60",
                isChipSelected
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {chip}
            </button>
          );
        })}
      </div>

      {/* Freeform entry */}
      <form onSubmit={handleFreeformSubmit} className="flex flex-col gap-2">
        <label
          className="text-muted-foreground text-xs font-medium"
          htmlFor={`flag-freeform-${itemId}`}
        >
          Anything else?
        </label>
        <input
          id={`flag-freeform-${itemId}`}
          type="text"
          value={freeformFlag}
          onChange={(e) => {
            // Strip NUL and CRLF on input; cap at FLAG_MAX for display
            const clean = sanitize(e.target.value, FLAG_MAX);
            setFreeformFlag(clean);
            setSaved(false);
          }}
          placeholder="Anything else?"
          maxLength={FLAG_MAX}
          disabled={isPending}
          className={cn(
            "rounded-md border border-border bg-background px-3 py-1.5 text-sm",
            "placeholder:text-muted-foreground",
            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        />

        {/* Note field (optional extra detail) */}
        <label
          className="text-muted-foreground text-xs font-medium"
          htmlFor={`flag-note-${itemId}`}
        >
          {M3_UI_STRINGS.itinerary_item_flag_note_label}
        </label>
        <textarea
          id={`flag-note-${itemId}`}
          value={note}
          onChange={(e) => {
            const clean = sanitize(e.target.value, NOTE_MAX);
            setNote(clean);
            setSaved(false);
          }}
          placeholder="More context for the organizers…"
          maxLength={NOTE_MAX}
          rows={2}
          disabled={isPending}
          className={cn(
            "rounded-md border border-border bg-background px-3 py-1.5 text-sm resize-none",
            "placeholder:text-muted-foreground",
            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        />

        <button
          type="submit"
          disabled={isPending || !freeformFlag.trim()}
          className={cn(
            "focus-visible:ring-ring self-start rounded-full border px-4 py-1.5 text-xs font-medium transition-colors",
            "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60",
            "border-border bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          Add
        </button>
      </form>

      {/* Quiet confirmation — no organizer phrasing (Voice CRITICAL C8) */}
      {saved ? (
        <p className="text-muted-foreground text-xs">
          {M3_UI_STRINGS.itinerary_item_flag_saved}
        </p>
      ) : null}

      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-xs")}>
          {ERRORS[errorKey]}
        </p>
      ) : null}
    </div>
  );
}
