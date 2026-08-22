"use client";

/**
 * ItemCommentSection — collapsed disclosure + flat comment thread +
 * composer for one itinerary item ("plan"), bundled into a single unit.
 *
 * Unlike polls (PollsDisclosure + PollCommentThread + PollCommentComposer
 * as three separate pieces on a less-crowded card), item cards are
 * already dense (time, cost, address, dress code, tags, RSVP chip,
 * member flags) — so this collapses behind one disclosure row, closed
 * by default always (no auto-expand-on-existing-comments), and expands
 * to the thread + composer together.
 *
 * Optimistic overlay + freshness mirror PollCard/PollCommentThread: a
 * successful post appends to local `optimisticComments` (deduped
 * against the `comments` prop by idempotency_key on the next server
 * refresh); a successful delete calls `router.refresh()` so the surface
 * does not hard-depend on the Realtime channel landing the DELETE
 * (#349 posture).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDistance } from "date-fns";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { callAction } from "@/lib/ui/call-action";
import {
  postItemCommentAction,
  deleteItemCommentAction,
} from "@/lib/actions/itinerary";
import { resolveContentAuthorName } from "@/lib/utils/member-display";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import type { ItemComment } from "@/lib/db/types";

export interface ItemCommentSectionProps {
  itemId: string;
  comments: readonly ItemComment[];
  /** The viewer's trip_members.id — undefined hides the composer (no
   * seat to author a comment as). */
  viewerTripMemberId: string | undefined;
  isViewerOrganizer: boolean;
  /** The viewer's own display name — used ONLY so a just-posted
   * optimistic comment shows the real name instead of flashing
   * "Someone" (#405-C pattern). */
  viewerDisplayName: string | null;
  now: Date;
}

function disclosureLabel(count: number): string {
  if (count === 0) return M3_UI_STRINGS.itinerary_item_comments_disclosure_zero;
  if (count === 1) return M3_UI_STRINGS.itinerary_item_comments_disclosure_one;
  return M3_UI_STRINGS.itinerary_item_comments_disclosure_other_template.replace(
    "{count}",
    String(count)
  );
}

export function ItemCommentSection({
  itemId,
  comments,
  viewerTripMemberId,
  isViewerOrganizer,
  viewerDisplayName,
  now,
}: ItemCommentSectionProps) {
  const router = useRouter();
  const panelId = React.useId();
  const [open, setOpen] = React.useState(false);
  const [deletedIds, setDeletedIds] = React.useState<ReadonlySet<string>>(
    new Set()
  );
  const [optimisticComments, setOptimisticComments] = React.useState<
    readonly ItemComment[]
  >([]);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(
    null
  );
  const [deleteErrorKey, setDeleteErrorKey] = React.useState<ErrorKey | null>(
    null
  );
  const [body, setBody] = React.useState("");
  const [isPosting, setIsPosting] = React.useState(false);
  const [postErrorKey, setPostErrorKey] = React.useState<ErrorKey | null>(
    null
  );
  const [idempotencyKey, setIdempotencyKey] = React.useState<string>(() =>
    crypto.randomUUID()
  );

  const mergedComments = React.useMemo(() => {
    const known = new Set(
      comments.map((c) => c.idempotency_key).filter((k): k is string => k != null)
    );
    const stillPending = optimisticComments.filter(
      (c) => c.idempotency_key == null || !known.has(c.idempotency_key)
    );
    return [...comments, ...stillPending].filter((c) => !deletedIds.has(c.id));
  }, [comments, optimisticComments, deletedIds]);

  const selfMap = React.useMemo(
    () =>
      viewerTripMemberId
        ? new Map([[viewerTripMemberId, { display_name: viewerDisplayName }]])
        : new Map<string, { display_name: string | null }>(),
    [viewerTripMemberId, viewerDisplayName]
  );

  const handleDelete = (commentId: string) => {
    if (pendingDeleteId) return;
    if (!window.confirm(M3_UI_STRINGS.itinerary_item_comment_delete_confirm))
      return;

    setDeleteErrorKey(null);
    setPendingDeleteId(commentId);
    void (async () => {
      try {
        const key = crypto.randomUUID();
        const result = await callAction(() =>
          deleteItemCommentAction({ commentId }, key)
        );
        if (!result.ok) {
          setDeleteErrorKey(result.errorKey);
          return;
        }
        setDeletedIds((prev) => new Set(prev).add(commentId));
        router.refresh();
      } finally {
        setPendingDeleteId(null);
      }
    })();
  };

  const trimmedBody = body.trim();
  const canSubmit = trimmedBody.length > 0 && !isPosting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setPostErrorKey(null);
    setIsPosting(true);
    try {
      const result = await callAction(() =>
        postItemCommentAction({ itemId, body: trimmedBody }, idempotencyKey)
      );
      if (!result.ok) {
        setPostErrorKey(result.errorKey);
        return;
      }
      setOptimisticComments((prev) => [...prev, result.comment]);
      setBody("");
      setIdempotencyKey(crypto.randomUUID());
    } finally {
      setIsPosting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex w-fit items-center gap-1.5 text-left text-xs font-medium text-muted-foreground",
          "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        )}
      >
        <span>{disclosureLabel(mergedComments.length)}</span>
        <ChevronDown
          aria-hidden
          strokeWidth={1.75}
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none",
            open && "rotate-180"
          )}
        />
      </button>

      {open ? (
        <div id={panelId} className="flex flex-col gap-3">
          {mergedComments.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {M3_UI_STRINGS.itinerary_item_comments_empty}
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {mergedComments.map((comment) => {
                const name = resolveContentAuthorName(
                  selfMap,
                  comment.author_trip_member_id,
                  comment.authorDisplayName
                );
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
                        {M3_UI_STRINGS.itinerary_item_comment_author_line_template
                          .replace("{name}", name)
                          .replace("{when}", when)}
                      </p>
                      {canDeleteThis ? (
                        <button
                          type="button"
                          aria-label={M3_UI_STRINGS.itinerary_item_comment_delete_aria}
                          disabled={pendingDeleteId === comment.id}
                          onClick={() => handleDelete(comment.id)}
                          className="text-muted-foreground shrink-0 text-xs underline underline-offset-2 disabled:opacity-60"
                        >
                          {M3_UI_STRINGS.itinerary_item_comment_delete_cta}
                        </button>
                      ) : null}
                    </div>
                    <p className="text-sm">{comment.body}</p>
                  </li>
                );
              })}
            </ul>
          )}

          {deleteErrorKey ? (
            <p role="alert" className={cn(ERROR_LINE_CLASS, "text-xs")}>
              {ERRORS[deleteErrorKey]}
            </p>
          ) : null}

          {viewerTripMemberId !== undefined ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <label
                  htmlFor={`item-comment-body-${itemId}`}
                  className="sr-only"
                >
                  {M3_UI_STRINGS.itinerary_item_comment_placeholder}
                </label>
                <input
                  id={`item-comment-body-${itemId}`}
                  type="text"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={M3_UI_STRINGS.itinerary_item_comment_placeholder}
                  disabled={isPosting}
                  className={cn(
                    "w-full flex-1 rounded-xs border border-border bg-background px-3 py-2 text-sm",
                    "placeholder:text-muted-foreground",
                    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                    "disabled:cursor-not-allowed disabled:opacity-60"
                  )}
                />
                <button
                  type="submit"
                  disabled={!canSubmit}
                  aria-busy={isPosting}
                  aria-label={M3_UI_STRINGS.itinerary_item_comment_composer_submit_aria}
                  className={cn(
                    "focus-visible:ring-ring shrink-0 rounded-xs bg-primary px-3 py-2 text-xs font-medium text-primary-foreground",
                    "focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
                    "disabled:cursor-not-allowed disabled:opacity-60"
                  )}
                >
                  {M3_UI_STRINGS.itinerary_item_comment_composer_submit_aria}
                </button>
              </div>
              {postErrorKey ? (
                <p role="alert" className={cn(ERROR_LINE_CLASS, "text-xs")}>
                  {ERRORS[postErrorKey]}
                </p>
              ) : null}
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
