"use client";

/**
 * ShoppingNoteComposer — single-line note composer pinned at the bottom of
 * the P2-T6 detail sheet (spec §12.6).
 *
 * Idempotency key is PER-LOGICAL-COMMENT, not per sheet-open (the AddItemSheet
 * gap-B precedent): `keyRef` seeds once via a `useState` lazy initializer
 * (runs once per mount, same as `AddItemSheet`'s "seeded once, reused
 * across retries" contract — `crypto.randomUUID()` is safe to call during
 * render since Node also exposes a global `crypto.randomUUID`, and the key
 * is never serialized into markup, so there's no hydration-mismatch risk
 * the way there would be for rendered content), is REUSED across retries of
 * the same note (a failed submit keeps the key so a retry replays safely),
 * and ROTATES to a fresh UUID on every CONFIRMED `ok:true`. Rotating only
 * on the sheet-open
 * precedent (like AddItemSheet) would break a second note posted in the
 * same open sheet — it would reuse the first note's key, collide on the
 * unique (item_id, author_trip_member_id, idempotency_key) index, and the
 * server's 23505 branch would silently re-select the FIRST note instead of
 * inserting the second (see the action's module header).
 */

import * as React from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { callAction } from "@/lib/ui/call-action";
import { addShoppingComment } from "@/lib/actions/shopping-item-comments";
import { SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import type { ShoppingItemComment } from "@/lib/db/types";

export interface ShoppingNoteComposerProps {
  itemId: string;
  /** Fired with the server-confirmed comment on a successful post. */
  onSubmitted: (comment: ShoppingItemComment) => void;
  /** Surfaced when the post discovers the parent item is gone (rls_denied). */
  onGone: () => void;
}

export function ShoppingNoteComposer({
  itemId,
  onSubmitted,
  onGone,
}: ShoppingNoteComposerProps) {
  const [body, setBody] = React.useState("");
  const [isPending, setIsPending] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);
  // Seeded once via a lazy initializer (see module header), reused across
  // retries, rotated only after a confirmed ok:true.
  const [idempotencyKey, setIdempotencyKey] = React.useState<string>(() =>
    crypto.randomUUID()
  );

  const trimmed = body.trim();
  const canSubmit = trimmed.length > 0 && !isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setErrorKey(null);
    setIsPending(true);
    try {
      const result = await callAction(() =>
        addShoppingComment({ itemId, body: trimmed }, idempotencyKey)
      );
      if (!result.ok) {
        if (result.errorKey === "rls_denied") {
          onGone();
          return;
        }
        setErrorKey(result.errorKey);
        return;
      }

      onSubmitted(result.comment);
      setBody("");
      // Rotate ONLY after a confirmed ok:true — the load-bearing per-note
      // rotation (see module header). A retry of a FAILED submit reuses
      // the same key on its next attempt.
      setIdempotencyKey(crypto.randomUUID());
    } finally {
      setIsPending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <label htmlFor="shopping-note-body" className="sr-only">
          {SHOPPING_LIST_UI_STRINGS.notePlaceholder}
        </label>
        <input
          id="shopping-note-body"
          type="text"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={SHOPPING_LIST_UI_STRINGS.notePlaceholder}
          disabled={isPending}
          className={cn(
            "w-full flex-1 rounded-xs border border-border bg-background px-3 py-2 text-sm",
            "placeholder:text-muted-foreground",
            "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            "disabled:cursor-not-allowed disabled:opacity-60"
          )}
        />
        <Button
          type="submit"
          size="sm"
          disabled={!canSubmit}
          aria-busy={isPending}
          aria-label={SHOPPING_LIST_UI_STRINGS.noteComposerSubmit_aria}
        >
          {SHOPPING_LIST_UI_STRINGS.noteComposerSubmit_aria}
        </Button>
      </div>
      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-xs")}>
          {ERRORS[errorKey]}
        </p>
      ) : null}
    </form>
  );
}
