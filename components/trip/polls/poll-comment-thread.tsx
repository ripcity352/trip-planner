"use client";

/**
 * PollCommentThread — the flat comment thread mounted under a poll's
 * options (#620, part 1/3 of #616). Near-direct clone of
 * `ShoppingNotesThread` (components/trip/shopping-list/ShoppingNotesThread.tsx),
 * re-keyed by `poll_id` / `poll_comments`.
 *
 * Flat, newest-at-bottom. Author name resolution goes through
 * `resolveContentAuthorName` — "Someone" fallback, never `resolveMemberName`'s
 * roster "Guest" — and NEVER renders `.email` (I6). Delete affordance:
 * visible only on the viewer's OWN line (author) or for an organizer,
 * absent for everyone else (rule 11 — no "you can't do this" gate
 * message, the control simply isn't there).
 *
 * Freshness (#349 — must NOT hard-depend on Realtime): a successful
 * delete calls `router.refresh()`, which re-renders the announcements
 * Server Component page and flows fresh `commentsByPoll` props back
 * down through PollsDisclosure → PollsSection → PollCard. The parent
 * (PollCard) additionally keeps an optimistic overlay so the viewer's
 * OWN post/delete never waits on that refresh to paint.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDistance } from "date-fns";

import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { callAction } from "@/lib/ui/call-action";
import { deletePollCommentAction } from "@/lib/actions/polls";
import { resolveContentAuthorName } from "@/lib/utils/member-display";
import { M5_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import type { PollComment } from "@/lib/db/types";

export interface PollCommentThreadProps {
  comments: readonly PollComment[];
  viewerTripMemberId: string | undefined;
  isViewerOrganizer: boolean;
  now: Date;
  /** The viewer's own display name — used ONLY so a just-posted
   * optimistic comment (server-inserted row, not yet re-enriched by a
   * refresh) shows the real name instead of flashing "Someone" (#405-C
   * pattern). Every other comment arrives pre-enriched via
   * `authorDisplayName` (server-side `enrichPollComments`). */
  viewerDisplayName: string | null;
  /** Called after a successful delete so the caller can drop the row
   * from its own optimistic overlay too. */
  onDeleted: (commentId: string) => void;
}

export function PollCommentThread({
  comments,
  viewerTripMemberId,
  isViewerOrganizer,
  now,
  viewerDisplayName,
  onDeleted,
}: PollCommentThreadProps) {
  const router = useRouter();
  const [deletedIds, setDeletedIds] = React.useState<ReadonlySet<string>>(
    new Set()
  );
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [errorKey, setErrorKey] = React.useState<ErrorKey | null>(null);

  const visibleComments = comments.filter((c) => !deletedIds.has(c.id));

  // Only the viewer's own id is resolvable client-side (no full roster
  // map is threaded through this surface — every peer comment arrives
  // pre-enriched). A miss falls through to resolveContentAuthorName's
  // "Someone" fallback.
  const selfMap = React.useMemo(
    () =>
      viewerTripMemberId
        ? new Map([[viewerTripMemberId, { display_name: viewerDisplayName }]])
        : new Map<string, { display_name: string | null }>(),
    [viewerTripMemberId, viewerDisplayName]
  );

  const handleDelete = (commentId: string) => {
    if (pendingId) return;
    if (!window.confirm(M5_UI_STRINGS.polls_comment_delete_confirm)) return;

    setErrorKey(null);
    setPendingId(commentId);
    void (async () => {
      try {
        const idempotencyKey = crypto.randomUUID();
        const result = await callAction(() =>
          deletePollCommentAction({ commentId }, idempotencyKey)
        );
        if (!result.ok) {
          setErrorKey(result.errorKey);
          return;
        }
        setDeletedIds((prev) => new Set(prev).add(commentId));
        onDeleted(commentId);
        router.refresh();
      } finally {
        setPendingId(null);
      }
    })();
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-medium">
        {M5_UI_STRINGS.polls_comments_heading}
      </h3>

      {visibleComments.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {M5_UI_STRINGS.polls_comments_empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visibleComments.map((comment) => {
            const name = resolveContentAuthorName(
              selfMap,
              comment.author_trip_member_id,
              comment.authorDisplayName
            );
            // formatDistance(date, now) — NOT formatDistanceToNow — so
            // the relative label is pinned to the page's `now` prop
            // (server clock) rather than each render's wall clock,
            // avoiding an SSR/CSR hydration-text mismatch.
            const when = formatDistance(new Date(comment.created_at), now, {
              addSuffix: true,
            });
            const canDeleteThis =
              isViewerOrganizer ||
              (viewerTripMemberId !== undefined &&
                comment.author_trip_member_id === viewerTripMemberId);

            return (
              <li key={comment.id} className="flex flex-col gap-0.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-muted-foreground text-xs">
                    {M5_UI_STRINGS.polls_comment_author_line_template
                      .replace("{name}", name)
                      .replace("{when}", when)}
                  </p>
                  {canDeleteThis ? (
                    <button
                      type="button"
                      aria-label={M5_UI_STRINGS.polls_comment_delete_aria}
                      disabled={pendingId === comment.id}
                      onClick={() => handleDelete(comment.id)}
                      className="text-muted-foreground shrink-0 text-xs underline underline-offset-2 disabled:opacity-60"
                    >
                      {M5_UI_STRINGS.polls_comment_delete_cta}
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
