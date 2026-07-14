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
 * #399: the whole panel now sits behind a disclosure (the voice-locked
 * heading is the trigger, `aria-expanded` + conditional render). Default
 * CLOSED; auto-opens only when the member already has saved flags on this
 * item. Conditional render (no animation) keeps it reduced-motion safe;
 * the chevron's rotate transition is gated by `motion-reduce`.
 *
 * #398: the member's own stored CUSTOM flags (anything not in
 * MEMBER_FLAG_CHIPS) render as removable rows — note alongside — wired to
 * the existing removeItemFlag action (owner-delete RLS already exists).
 *
 * Injection defenses (Coverage HIGH H1):
 *   - flag: stripped of NUL + CRLF, capped at 100 chars
 *   - note: stripped of NUL + CRLF, capped at 500 chars
 * The server action (Zod schema) is the final gate; the client rejects
 * before submit as defense-in-depth.
 */

import * as React from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { callAction } from "@/lib/ui/call-action";
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

/** Widened once so `includes` accepts any string, not just the chip union. */
const FIXED_CHIPS: ReadonlyArray<string> = MEMBER_FLAG_CHIPS;

// ─── Types ────────────────────────────────────────────────────────────────────

/** The slice of a stored flag row the picker needs (#398 — note rides along). */
export interface MemberFlagRow {
  flag: string;
  note: string | null;
}

export interface MemberFlagPickerProps {
  itemId: string;
  /** The member's own stored flag rows (RLS-scoped upstream). Fixed chips
   * pre-select; custom rows render as removable entries (#398). */
  initialFlags?: ReadonlyArray<MemberFlagRow>;
  className?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MemberFlagPicker({
  itemId,
  initialFlags = [],
  className,
}: MemberFlagPickerProps) {
  const [selected, setSelected] = React.useState<Set<string>>(
    () =>
      new Set(
        initialFlags.filter((f) => FIXED_CHIPS.includes(f.flag)).map((f) => f.flag)
      )
  );
  const [customFlags, setCustomFlags] = React.useState<
    ReadonlyArray<MemberFlagRow>
  >(() => initialFlags.filter((f) => !FIXED_CHIPS.includes(f.flag)));
  // #399: closed by default; auto-open only when flags already exist.
  const [open, setOpen] = React.useState(initialFlags.length > 0);
  const [freeformFlag, setFreeformFlag] = React.useState("");
  const [note, setNote] = React.useState("");
  const [saved, setSaved] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const panelId = `flag-panel-${itemId}`;

  // ── Chip toggle ─────────────────────────────────────────────────────────────

  const toggleChip = (chip: string) => {
    const isSelected = selected.has(chip);

    setErrorKey(null);
    setSaved(false);

    if (isSelected) {
      startTransition(async () => {
        // #431: rejected awaits resolve to the network envelope via callAction.
        const result = await callAction(() => removeItemFlag(itemId, chip));
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
      });
    } else {
      startTransition(async () => {
        const result = await callAction(() => addItemFlag({ itemId, flag: chip }));
        if (!result.ok) {
          setErrorKey(result.errorKey);
          return;
        }
        setSelected((prev) => new Set([...prev, chip]));
        setSaved(true);
      });
    }
  };

  // ── Custom-flag remove (#398 — existing owner-delete RLS, existing action) ──

  const removeCustomFlag = (flag: string) => {
    setErrorKey(null);
    setSaved(false);

    startTransition(async () => {
      const result = await callAction(() => removeItemFlag(itemId, flag));
      if (!result.ok) {
        setErrorKey(result.errorKey);
        return;
      }
      setCustomFlags((prev) => prev.filter((f) => f.flag !== flag));
      setSaved(true);
    });
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
      const result = await callAction(() =>
        addItemFlag({
          itemId,
          flag: cleanFlag,
          note: cleanNote,
        })
      );

      if (!result.ok) {
        setErrorKey(result.errorKey);
        return;
      }

      // If the typed text matches a fixed chip (e.g. "Vegan"), reflect it as
      // a pressed chip — not a custom row — so the immediate post-submit UI
      // matches what a reload derives from initialFlags.
      if (FIXED_CHIPS.includes(cleanFlag)) {
        setSelected((prev) => new Set([...prev, cleanFlag]));
      } else {
        // #398: reflect the stored row immediately (dedupe on flag text so a
        // double-submit doesn't render twice).
        setCustomFlags((prev) => [
          ...prev.filter((f) => f.flag !== cleanFlag),
          { flag: cleanFlag, note: cleanNote },
        ]);
      }
      setFreeformFlag("");
      setNote("");
      setSaved(true);
    });
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* #399 disclosure trigger — voice-locked heading doubles as the button */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-xs text-left",
          "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        )}
      >
        <span className="text-sm font-semibold">
          {M4_UI_STRINGS.itineraryItem_memberFlag_heading}
        </span>
        <ChevronDown
          aria-hidden
          strokeWidth={1.75}
          className={cn(
            "text-muted-foreground h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none",
            open && "rotate-180"
          )}
        />
      </button>

      {/* Panel body — conditional render (no animation → reduced-motion safe) */}
      {open ? (
        <div id={panelId} className="flex flex-col gap-3">
          <p className="text-muted-foreground text-xs">
            {M4_UI_STRINGS.itineraryItem_memberFlag_subhead}
          </p>

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

          {/* #398: the member's own stored custom flags — removable, note alongside */}
          {customFlags.length > 0 ? (
            <ul className="flex flex-col gap-1.5">
              {customFlags.map(({ flag, note: flagNote }) => (
                <li
                  key={flag}
                  className="border-border bg-muted flex items-start gap-2 rounded-xs border px-3 py-1.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium break-words">{flag}</p>
                    {flagNote ? (
                      <p className="text-muted-foreground text-xs break-words">
                        {flagNote}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    // aria-label templates over user content follow the
                    // maps-link pattern; the flag text is member content,
                    // not app copy.
                    aria-label={`Remove "${flag}"`}
                    disabled={isPending}
                    onClick={() => removeCustomFlag(flag)}
                    className={cn(
                      "text-muted-foreground hover:text-foreground -mr-1 shrink-0 rounded-xs p-0.5 transition-colors",
                      "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                      "disabled:cursor-not-allowed disabled:opacity-60"
                    )}
                  >
                    <X aria-hidden strokeWidth={1.75} className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {/* Freeform entry */}
          <form onSubmit={handleFreeformSubmit} className="flex flex-col gap-2">
            <label
              className="text-muted-foreground text-xs font-medium"
              htmlFor={`flag-freeform-${itemId}`}
            >
              {M4_UI_STRINGS.itineraryItem_memberFlag_freeform_label}
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
              placeholder={M4_UI_STRINGS.itineraryItem_memberFlag_freeform_placeholder}
              maxLength={FLAG_MAX}
              disabled={isPending}
              className={cn(
                "rounded-xs border border-border bg-background px-3 py-1.5 text-sm",
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
              placeholder={M3_UI_STRINGS.itinerary_item_flag_note_placeholder}
              maxLength={NOTE_MAX}
              rows={2}
              disabled={isPending}
              className={cn(
                "rounded-xs border border-border bg-background px-3 py-1.5 text-sm resize-none",
                "placeholder:text-muted-foreground",
                "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                "disabled:cursor-not-allowed disabled:opacity-60"
              )}
            />

            <button
              type="submit"
              disabled={isPending || !freeformFlag.trim()}
              className={cn(
                "focus-visible:ring-ring self-start rounded-xs border px-4 py-1.5 text-xs font-medium transition-colors",
                "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                "disabled:cursor-not-allowed disabled:opacity-60",
                "border-border bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {M4_UI_STRINGS.itineraryItem_memberFlag_freeform_add}
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
      ) : null}
    </div>
  );
}
