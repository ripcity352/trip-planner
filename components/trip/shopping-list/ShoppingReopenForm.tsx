"use client";

/**
 * ShoppingReopenForm — the reopen-with-note flow (Task 5b, spec §6).
 *
 * An inline expanding panel below the row (mirrors `ShoppingNoteComposer`'s
 * inline-composer style — there is no dialog primitive in this app): an
 * assign picker defaulting to "Open — no one", an optional note textarea,
 * and a confirm/cancel pair. Confirming calls `reopenShoppingItem(itemId,
 * { assignTo, comment }, idempotencyKey)`.
 *
 * Idempotency key: seeded once via a `useState` lazy initializer (same
 * "seeded once, reused across retries, rotated only after a confirmed
 * ok:true" contract as `ShoppingNoteComposer` — see its module header). A
 * blank note still ships a key; the action ignores it when there's no
 * comment to post.
 *
 * Error handling carry-forward (5a/Task-4): `reopenShoppingItem` can
 * return a `shopping_comment_*` errorKey when the reopen itself COMMITTED
 * but the note post failed. That is surfaced in the `role="alert"` region
 * below and the form stays open (retry is safe — the reopen re-runs
 * harmlessly and the note replays by idempotency key) — the caller only
 * ever hears about success via `onConfirmed`, never a partial one.
 */

import * as React from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { callAction } from "@/lib/ui/call-action";
import { reopenShoppingItem } from "@/lib/actions/shopping-list";
import { resolveMemberName } from "@/lib/utils/member-display";
import { SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import { ShoppingMemberPicker } from "./ShoppingMemberPicker";
import type { TripMember } from "@/lib/db/types";

export interface ShoppingReopenFormProps {
  itemId: string;
  members: TripMember[];
  memberMap: ReadonlyMap<string, TripMember>;
  onCancel: () => void;
  /** Fired once the reopen (and any note) is confirmed ok:true. */
  onConfirmed: () => void;
}

export function ShoppingReopenForm({
  itemId,
  members,
  memberMap,
  onCancel,
  onConfirmed,
}: ShoppingReopenFormProps) {
  const [assignTo, setAssignTo] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  const [isPending, setIsPending] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  // Seeded once, reused across retries, rotated only after a confirmed
  // ok:true — same contract as `ShoppingNoteComposer` (see module header).
  const [idempotencyKey, setIdempotencyKey] = React.useState<string>(() =>
    crypto.randomUUID()
  );

  const assignLabel =
    assignTo === null
      ? SHOPPING_LIST_UI_STRINGS.assignOpenNoOne
      : resolveMemberName(memberMap, assignTo);

  const handleConfirm = async () => {
    setErrorKey(null);
    setIsPending(true);
    const trimmedNote = note.trim();
    try {
      const result = await callAction(() =>
        reopenShoppingItem(
          itemId,
          { assignTo, comment: trimmedNote || undefined },
          idempotencyKey
        )
      );
      if (!result.ok) {
        setErrorKey(result.errorKey);
        return;
      }
      // Rotate ONLY after a confirmed ok:true — a retry of a failed
      // confirm reuses the same key on its next attempt.
      setIdempotencyKey(crypto.randomUUID());
      onConfirmed();
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="border-border bg-muted/30 mt-1 flex flex-col gap-2 rounded-md border p-2.5">
      <div className="flex items-center gap-2 text-xs">
        <span
          id={`reopen-assign-label-${itemId}`}
          className="text-muted-foreground"
        >
          {SHOPPING_LIST_UI_STRINGS.assignAction}
        </span>
        <ShoppingMemberPicker
          members={members}
          memberMap={memberMap}
          includeOpenNoOne
          triggerLabel={assignLabel}
          triggerDescribedBy={`reopen-assign-label-${itemId}`}
          onSelect={setAssignTo}
          disabled={isPending}
        />
      </div>

      <label htmlFor={`reopen-note-${itemId}`} className="sr-only">
        {SHOPPING_LIST_UI_STRINGS.reopenNotePlaceholder}
      </label>
      <textarea
        id={`reopen-note-${itemId}`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder={SHOPPING_LIST_UI_STRINGS.reopenNotePlaceholder}
        disabled={isPending}
        rows={2}
        className={cn(
          "w-full rounded-xs border border-border bg-background px-3 py-2 text-sm",
          "placeholder:text-muted-foreground",
          "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-60"
        )}
      />

      <div className="flex items-center gap-3">
        <Button
          type="button"
          size="sm"
          disabled={isPending}
          aria-busy={isPending}
          onClick={handleConfirm}
        >
          {SHOPPING_LIST_UI_STRINGS.reopenAction}
        </Button>
        <button
          type="button"
          disabled={isPending}
          onClick={onCancel}
          className="text-muted-foreground text-xs underline underline-offset-2 disabled:opacity-60"
        >
          {SHOPPING_LIST_UI_STRINGS.cancelCta}
        </button>
      </div>

      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-xs")}>
          {ERRORS[errorKey]}
        </p>
      ) : null}
    </div>
  );
}
