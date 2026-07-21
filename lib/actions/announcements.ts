"use server";

/**
 * Server actions for announcements (M3 #79).
 *
 * Surface contract:
 *   - `postAnnouncement(input, idempotencyKey)` validates, authenticates,
 *     rate-limits under POST_ANNOUNCEMENT, and inserts the row.
 *   - Organizer-only via RLS.
 *   - Idempotency key scope: (trip_id, idempotency_key) — organizer
 *     acting on behalf of the trip.
 *   - F2 / #110 pattern: `revalidatePath` fires on every success branch
 *     (fresh insert AND idempotency replay) so the poster's own view
 *     never depends on the Realtime channel — see notes/decisions.md
 *     "F2 — the #110 mutation contract extends…".
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  rateLimitedAction,
} from "@/lib/rate-limit";
import type { ErrorKey } from "@/lib/copy/errors";
import type { Announcement } from "@/lib/db/types";

const postAnnouncementSchema = z.object({
  tripId: z.string().uuid(),
  body: z.string().trim().min(1).max(5000),
  pinned: z.boolean().optional().default(false),
  visibility: z
    .enum(["everyone", "organizers_only", "hide_from_celebrant", "custom"])
    .optional()
    .default("everyone"),
});

const IDEMPOTENCY_KEY_SCHEMA = z.string().uuid();

export interface PostAnnouncementInput {
  tripId: string;
  body: string;
  pinned?: boolean;
  visibility?: "everyone" | "organizers_only" | "hide_from_celebrant" | "custom";
}

export type PostAnnouncementResult =
  | { ok: true; announcement: Announcement }
  | { ok: false; errorKey: ErrorKey };

const ANNOUNCEMENT_COLUMNS =
  "id, trip_id, author_id, body, pinned, created_at, idempotency_key, visibility, created_by";

/**
 * Post an announcement. Organizer-only via RLS. Idempotent on
 * (trip_id, idempotency_key) — drunk-user-on-bad-signal double-tap
 * returns the existing row rather than inserting a duplicate.
 */
export async function postAnnouncement(
  input: PostAnnouncementInput,
  idempotencyKey: string
): Promise<PostAnnouncementResult> {
  const keyParse = IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey);
  if (!keyParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const parsed = postAnnouncementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "rls_denied" };
  }
  const userId = authData.user.id;

  const { tripId, body, pinned, visibility } = parsed.data;

  try {
    const announcement = await rateLimitedAction(
      RATE_LIMIT_SCOPES.POST_ANNOUNCEMENT,
      userId,
      async () => {
        const { data, error } = await supabase
          .from("announcements")
          .insert({
            trip_id: tripId,
            author_id: userId,
            created_by: userId,
            body,
            pinned: pinned ?? false,
            visibility: visibility ?? "everyone",
            idempotency_key: idempotencyKey,
          })
          .select(ANNOUNCEMENT_COLUMNS)
          .single();

        if (error) {
          // Idempotency replay: partial unique on (trip_id, idempotency_key)
          if (error.code === "23505") {
            const { data: existing, error: fetchError } = await supabase
              .from("announcements")
              .select(ANNOUNCEMENT_COLUMNS)
              .eq("trip_id", tripId)
              .eq("idempotency_key", idempotencyKey)
              .single();

            if (fetchError) {
              throw new AnnouncementActionError("post_failed");
            }
            return existing as Announcement;
          }
          if (error.code === "42501") {
            throw new AnnouncementActionError("rls_denied");
          }
          // #474: a coded Postgres/PostgREST error is a deterministic
          // rejection, not a flaky connection — see itinerary.ts.
          throw new AnnouncementActionError(
            error.code ? "post_rejected" : "post_failed"
          );
        }
        return data as Announcement;
      }
    );

    // F2 / #110: revalidate the trips layout so the announcements feed
    // (and the dashboard link into it) stay fresh for the poster's own
    // view. Called only on the success branch — a failed insert must
    // not trigger a cache miss.
    revalidatePath("/trips", "layout");
    return { ok: true, announcement };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    if (err instanceof AnnouncementActionError) {
      return { ok: false, errorKey: announcementErrorKey(err.reason) };
    }
    console.error("[announcements] postAnnouncement unexpected:", err);
    return { ok: false, errorKey: "announcement_post_failed" };
  }
}

type AnnouncementErrorReason = "post_failed" | "post_rejected" | "rls_denied";

class AnnouncementActionError extends Error {
  readonly reason: AnnouncementErrorReason;

  constructor(reason: AnnouncementErrorReason) {
    super(`announcement_action_error:${reason}`);
    this.name = "AnnouncementActionError";
    this.reason = reason;
  }
}

// #474: see itinerary.ts's itineraryErrorKey for the rationale.
function announcementErrorKey(reason: AnnouncementErrorReason): ErrorKey {
  switch (reason) {
    case "rls_denied":
      return "rls_denied";
    case "post_rejected":
      return "announcement_post_rejected";
    case "post_failed":
      return "announcement_post_failed";
  }
}
