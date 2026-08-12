"use client";

/**
 * ShoppingNotesThread — the flat Notes comment thread inside the P2-T6
 * detail sheet (spec §12.6).
 *
 * Flat, newest-at-bottom. Header is the plain word "Notes" — never
 * "Notes (n)" (a count-in-a-header reads as a completion/inbox badge,
 * CLAUDE.md hard-ban). Author name resolution goes through
 * `resolveContentAuthorName` — "Someone" fallback, never `resolveMemberName`'s
 * roster "Guest" — and NEVER renders `.email` (I6).
 *
 * Delete affordance: visible only on the viewer's OWN line (author) or for
 * an organizer/co-organizer, absent for everyone else (rule 11 — no
 * "you can't do this" gate message, the control simply isn't there).
 * Deletes optimistically hide the row locally (deletedIds) and confirm via
 * `router.refresh()` reconciling the parent's props on the next render —
 * same "lag one refresh" MVP pattern as the row-level social affordances.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDistance } from "date-fns";

import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { callAction } from "@/lib/ui/call-action";
import { deleteShoppingComment } from "@/lib/actions/shopping-item-comments";
import { resolveContentAuthorName } from "@/lib/utils/member-display";
import { SHOPPING_LIST_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import type { ShoppingItemComment, TripMember } from "@/lib/db/types";

export interface ShoppingNotesThreadProps {
  comments: readonly ShoppingItemComment[];
  memberMap: ReadonlyMap<string, TripMember>;
  viewerMemberId: string;
  isViewerOrganizer: boolean;
  now: Date;
  /** Surfaced when a delete discovers the parent item is gone (rls_denied). */
  onGone: () => void;
}

export function ShoppingNotesThread({
  comments,
  memberMap,
  viewerMemberId,
  isViewerOrganizer,
  now,
  onGone,
}: ShoppingNotesThreadProps) {
  const router = useRouter();
  const [deletedIds, setDeletedIds] = React.useState<ReadonlySet<string>>(
    new Set()
  );
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);

  const visibleComments = comments.filter((c) => !deletedIds.has(c.id));

  const handleDelete = (commentId: string) => {
    if (pendingId) return;
    if (!window.confirm(SHOPPING_LIST_UI_STRINGS.noteDeleteConfirm)) return;

    setErrorKey(null);
    setPendingId(commentId);
    void (async () => {
      try {
        const result = await callAction(() => deleteShoppingComment(commentId));
        if (!result.ok) {
          if (result.errorKey === "rls_denied") {
            onGone();
            return;
          }
          setErrorKey(result.errorKey);
          return;
        }
        setDeletedIds((prev) => new Set(prev).add(commentId));
        router.refresh();
      } finally {
        setPendingId(null);
      }
    })();
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">
        {SHOPPING_LIST_UI_STRINGS.notesHeading}
      </h3>

      {visibleComments.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {SHOPPING_LIST_UI_STRINGS.notesEmpty}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visibleComments.map((comment) => {
            // Names resolve via resolveContentAuthorName — "Someone"
            // fallback, never raw .email (I6).
            const name = resolveContentAuthorName(
              memberMap,
              comment.author_trip_member_id,
              comment.authorDisplayName
            );
            // formatDistance(date, now) — NOT formatDistanceToNow — so the
            // relative label is pinned to the sheet's `now` prop (server
            // clock for a loaded row) rather than each render's wall
            // clock, avoiding an SSR/CSR hydration-text mismatch.
            const when = formatDistance(new Date(comment.created_at), now, {
              addSuffix: true,
            });
            const canDeleteThis =
              isViewerOrganizer ||
              comment.author_trip_member_id === viewerMemberId;

            return (
              <li key={comment.id} className="flex flex-col gap-0.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-muted-foreground text-xs">
                    {SHOPPING_LIST_UI_STRINGS.noteAuthorLine_template
                      .replace("{name}", name)
                      .replace("{when}", when)}
                  </p>
                  {canDeleteThis ? (
                    <button
                      type="button"
                      aria-label={SHOPPING_LIST_UI_STRINGS.noteDelete_aria}
                      disabled={pendingId === comment.id}
                      onClick={() => handleDelete(comment.id)}
                      className="text-muted-foreground shrink-0 text-xs underline underline-offset-2 disabled:opacity-60"
                    >
                      {SHOPPING_LIST_UI_STRINGS.deleteCta}
                    </button>
                  ) : null}
                </div>
                <p className="text-sm">{comment.body}</p>
              </li>
            );
          })}
        </ul>
      )}

      {errorKey ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-xs")}>
          {ERRORS[errorKey]}
        </p>
      ) : null}
    </div>
  );
}
