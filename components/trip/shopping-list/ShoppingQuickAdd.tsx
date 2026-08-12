"use client";

/**
 * ShoppingQuickAdd — always-visible single-line quick-add at the TOP of the
 * list (Task 7a, spec §7). This is the DEFAULT add path; `AddItemSheet`
 * (rendered alongside it, see `ShoppingList.tsx`) is demoted to "Add with
 * details" for the occasional item that needs category/cost/surprise.
 *
 * Idempotency (rule #9, gap-B precedent from `AddItemSheet` /
 * `ShoppingNoteComposer`): a fresh key is seeded once per mount via a
 * `useState` lazy initializer, REUSED across retries of the same logical
 * add (a failed Enter doesn't get a new key so a retry replays safely), and
 * ROTATED only after a confirmed `ok:true`. Each logical add is its own key
 * — a paste-split batch generates one fresh key PER LINE, independent of
 * the single-add key above.
 *
 * Sanitize (`sanitize_every_keystroke`): NUL/CR/LF are stripped on EVERY
 * `onChange`, not just on submit — mirrors `airport-picker.tsx`'s
 * `sanitizeFreeform`. This also covers a single-line paste, since paste
 * fires `onChange` through the same handler.
 *
 * Paste-split (spec §7): `onPaste` reads the clipboard text directly (a
 * paste event's `onChange` hasn't committed the new value yet, so it can't
 * be used to decide whether to intercept). If splitting on newlines yields
 * more than one non-blank line, the default paste is prevented and a
 * lightweight inline confirm ("Add {count} items?") gates a bulk add —
 * each line becomes its own `addShoppingItem` call with its own fresh key;
 * a per-line failure is collected but doesn't abort the rest. A single-line
 * paste is left alone and fills the input through the normal `onChange`
 * path (sanitized like any other keystroke).
 *
 * No optimistic list mutation — `router.refresh()` reconciles (accepted
 * MVP lag, same as every other shopping-list mutation).
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { addShoppingItem } from "@/lib/actions/shopping-list";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { callAction } from "@/lib/ui/call-action";
import { SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";

export interface ShoppingQuickAddProps {
  tripId: string;
}

/** Strip NUL bytes and CR/LF control characters — same shape as
 * `airport-picker.tsx`'s `sanitizeFreeform`. */
const FREEFORM_SANITIZE_REGEX = /[\0\r\n]/g;

function sanitizeFreeform(raw: string): string {
  return raw.replace(FREEFORM_SANITIZE_REGEX, "");
}

/** Splits pasted text into non-blank, trimmed, CR-free lines. */
function splitPasteLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => sanitizeFreeform(line).trim())
    .filter((line) => line.length > 0);
}

export function ShoppingQuickAdd({ tripId }: ShoppingQuickAddProps) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const [value, setValue] = React.useState("");
  const [isPending, setIsPending] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  const [pendingPasteLines, setPendingPasteLines] = React.useState<
    string[] | null
  >(null);

  // Seeded once, reused across retries, rotated only after a confirmed
  // ok:true — same contract as `AddItemSheet` / `ShoppingNoteComposer`.
  const [idempotencyKey, setIdempotencyKey] = React.useState<string>(() =>
    crypto.randomUUID()
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(sanitizeFreeform(e.target.value));
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const lines = splitPasteLines(e.clipboardData.getData("text"));
    if (lines.length > 1) {
      e.preventDefault();
      setErrorKey(null);
      setPendingPasteLines(lines);
    }
    // Single (or zero) line — let the default paste happen; it lands in
    // `handleChange` and gets sanitized like any other keystroke.
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending) return;

    const trimmed = value.trim();
    if (!trimmed) return;

    setErrorKey(null);
    setIsPending(true);
    try {
      const result = await callAction(() =>
        addShoppingItem({ tripId, name: trimmed }, idempotencyKey)
      );
      if (!result.ok) {
        setErrorKey(result.errorKey);
        return;
      }
      // Rotate ONLY after a confirmed ok:true — a retry of a failed add
      // reuses the same key on its next attempt.
      setIdempotencyKey(crypto.randomUUID());
      setValue("");
      router.refresh();
      inputRef.current?.focus();
    } finally {
      setIsPending(false);
    }
  };

  const handleConfirmPaste = async () => {
    if (!pendingPasteLines) return;
    setErrorKey(null);
    setIsPending(true);
    let lastFailure: ErrorKey | null = null;
    try {
      for (const line of pendingPasteLines) {
        // Own fresh key per line — independent of the single-add key.
        const result = await callAction(() =>
          addShoppingItem({ tripId, name: line }, crypto.randomUUID())
        );
        if (!result.ok) {
          lastFailure = result.errorKey;
        }
      }
    } finally {
      setIsPending(false);
    }
    setPendingPasteLines(null);
    setValue("");
    if (lastFailure) {
      setErrorKey(lastFailure);
    }
    router.refresh();
    inputRef.current?.focus();
  };

  const handleCancelPaste = () => {
    setPendingPasteLines(null);
  };

  const inputClass = cn(
    "w-full rounded-xs border border-border bg-background px-3 py-2 text-sm",
    "placeholder:text-muted-foreground",
    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
  );

  return (
    <div className="flex flex-col gap-1.5">
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <label htmlFor="shopping-quick-add" className="sr-only">
          {SHOPPING_LIST_UI_STRINGS.quickAddPlaceholder}
        </label>
        <input
          ref={inputRef}
          id="shopping-quick-add"
          type="text"
          value={value}
          onChange={handleChange}
          onPaste={handlePaste}
          placeholder={SHOPPING_LIST_UI_STRINGS.quickAddPlaceholder}
          className={inputClass}
        />
      </form>

      {pendingPasteLines ? (
        <div
          role="group"
          className="border-border bg-muted/30 flex items-center gap-3 rounded-xs border p-2 text-sm"
        >
          <p>
            {SHOPPING_LIST_UI_STRINGS.pasteAddConfirm_template.replace(
              "{count}",
              String(pendingPasteLines.length)
            )}
          </p>
          <Button
            type="button"
            size="sm"
            disabled={isPending}
            aria-busy={isPending}
            onClick={handleConfirmPaste}
          >
            {SHOPPING_LIST_UI_STRINGS.pasteAddConfirmCta}
          </Button>
          <button
            type="button"
            disabled={isPending}
            onClick={handleCancelPaste}
            className="text-muted-foreground text-xs underline underline-offset-2 disabled:opacity-60"
          >
            {SHOPPING_LIST_UI_STRINGS.cancelCta}
          </button>
        </div>
      ) : null}

      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-sm")}>
          {ERRORS[errorKey] ?? ERRORS.network}
        </p>
      ) : null}
    </div>
  );
}
