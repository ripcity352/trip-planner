"use server";

/**
 * Server actions for itinerary item management (M3 #35, #36).
 *
 * Surface contract:
 *   - All three actions validate with zod, authenticate the caller,
 *     rate-limit under CREATE_ITINERARY_ITEM, and return a discriminated
 *     union — no throwing to the caller.
 *   - Idempotency key is required for addItineraryItem and
 *     updateItineraryItem (organizer-acting-on-behalf pattern).
 *   - RLS enforces organizer-only write access; the app-layer auth check
 *     is defense-in-depth and provides the user id for rate-limiting.
 *   - deleteItineraryItem does not use an idempotency key — deletes are
 *     idempotent by nature (second delete returns rls_denied which
 *     the UI treats as success).
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  rateLimitedAction,
} from "@/lib/rate-limit";
import type { ErrorKey } from "@/lib/copy/errors";
import type { ItineraryItem } from "@/lib/db/types";
import { getTripById } from "@/lib/db/trips";
import { getItineraryItem } from "@/lib/db/itinerary";
import { isoToDbDate, isoToDbTime } from "@/lib/utils/format-trip-tz";

// ---------------------------------------------------------------------------
// Shared schemas
// ---------------------------------------------------------------------------

const ITINERARY_ITEM_KIND = [
  "event",
  "lodging",
  "transport",
  "meal",
  "activity",
] as const;

const addItemSchema = z.object({
  tripId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  kind: z.enum(ITINERARY_ITEM_KIND),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  // W2b: strict ISO-8601 validation. datetime_invalid error key surfaces
  // to the client when the value is non-null and non-ISO.
  startTime: z.string().datetime({ offset: true }).nullable().optional(),
  endTime: z.string().datetime({ offset: true }).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  addressPlaceId: z.string().trim().max(255).nullable().optional(),
  addressProvider: z.enum(["google"]).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  costCents: z.number().int().min(0).nullable().optional(),
  currency: z.string().length(3).optional().default("USD"),
  activityTag: z.array(z.string().trim().min(1).max(40)).max(20).optional().default([]),
  dressCode: z.string().trim().max(200).nullable().optional(),
  visibility: z
    .enum(["everyone", "organizers_only", "hide_from_celebrant", "custom"])
    .optional()
    .default("everyone"),
});

const updateItemSchema = addItemSchema
  .omit({ tripId: true })
  .extend({
    itemId: z.string().uuid(),
  })
  .partial({
    title: true,
    kind: true,
    day: true,
    activityTag: true,
    visibility: true,
  });

const IDEMPOTENCY_KEY_SCHEMA = z.string().uuid();

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type AddItineraryItemResult =
  | { ok: true; item: ItineraryItem }
  | { ok: false; errorKey: ErrorKey };

export type UpdateItineraryItemResult =
  | { ok: true; item: ItineraryItem }
  | { ok: false; errorKey: ErrorKey };

export type DeleteItineraryItemResult =
  | { ok: true }
  | { ok: false; errorKey: ErrorKey };

// ---------------------------------------------------------------------------
// addItineraryItem
// ---------------------------------------------------------------------------

export interface AddItineraryItemInput {
  tripId: string;
  title: string;
  kind: (typeof ITINERARY_ITEM_KIND)[number];
  day: string;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  address?: string | null;
  addressPlaceId?: string | null;
  addressProvider?: "google" | null;
  notes?: string | null;
  costCents?: number | null;
  currency?: string;
  activityTag?: string[];
  dressCode?: string | null;
  visibility?: "everyone" | "organizers_only" | "hide_from_celebrant" | "custom";
}

/**
 * Create an itinerary item. Organizer-only via RLS.
 * Idempotency key prevents duplicate inserts on retry.
 */
export async function addItineraryItem(
  input: AddItineraryItemInput,
  idempotencyKey: string
): Promise<AddItineraryItemResult> {
  const keyParse = IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey);
  if (!keyParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const parsed = addItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "rls_denied" };
  }
  const userId = authData.user.id;

  const {
    tripId,
    title,
    kind,
    day,
    startTime,
    endTime,
    location,
    address,
    addressPlaceId,
    addressProvider,
    notes,
    costCents,
    currency,
    activityTag,
    dressCode,
    visibility,
  } = parsed.data;

  // Fix B (P0): `start_time` / `end_time` are Postgres `time without time
  // zone` columns — the validated value here is a full UTC ISO-8601
  // instant, which Postgres rejects at the DB layer. Reduce it to the
  // trip-local wall-clock `HH:mm:ss` before writing. Only fetch the trip
  // (extra round-trip) when a time was actually provided.
  let tripTimezone: string | null = null;
  if (startTime != null || endTime != null) {
    const trip = await getTripById(supabase, tripId);
    if (!trip) {
      return { ok: false, errorKey: "rls_denied" };
    }
    tripTimezone = trip.timezone;
  }

  try {
    const item = await rateLimitedAction(
      RATE_LIMIT_SCOPES.CREATE_ITINERARY_ITEM,
      userId,
      async () => {
        const { data, error } = await supabase
          .from("itinerary_items")
          .insert({
            trip_id: tripId,
            title,
            kind,
            day,
            start_time: tripTimezone ? isoToDbTime(startTime, tripTimezone) : null,
            end_time: tripTimezone ? isoToDbTime(endTime, tripTimezone) : null,
            // #504: keep the end *date* — a multi-day item's end instant
            // falls on a later trip-local day than `day`.
            end_day: tripTimezone ? isoToDbDate(endTime, tripTimezone) : null,
            location: location ?? null,
            address: address ?? null,
            address_place_id: addressPlaceId ?? null,
            address_provider: addressProvider ?? null,
            notes: notes ?? null,
            cost_cents: costCents ?? null,
            currency: currency ?? "USD",
            activity_tag: activityTag ?? [],
            dress_code: dressCode ?? null,
            visibility: visibility ?? "everyone",
            idempotency_key: idempotencyKey,
            created_by: userId,
          })
          .select(
            "id, trip_id, day, start_time, end_time, end_day, title, location, address, address_place_id, address_provider, notes, cost_cents, currency, created_by, created_at, updated_at, visibility, kind, activity_tag, dress_code, idempotency_key"
          )
          .single();

        if (error) {
          // Idempotency replay: unique constraint on (trip_id, idempotency_key)
          if (error.code === "23505") {
            // Fetch the existing row and return it
            const { data: existing, error: fetchError } = await supabase
              .from("itinerary_items")
              .select(
                "id, trip_id, day, start_time, end_time, end_day, title, location, address, address_place_id, address_provider, notes, cost_cents, currency, created_by, created_at, updated_at, visibility, kind, activity_tag, dress_code, idempotency_key"
              )
              .eq("trip_id", tripId)
              .eq("idempotency_key", idempotencyKey)
              .single();

            if (fetchError) {
              throw new ItineraryActionError("save_failed");
            }
            return existing as ItineraryItem;
          }
          if (error.code === "42501") {
            throw new ItineraryActionError("rls_denied");
          }
          // #474: any other Postgres/PostgREST error carries a non-empty
          // `code` (constraint violation, type mismatch, check failure,
          // etc.) — that's a deterministic server-side rejection, not a
          // flaky connection. Retrying can never change the outcome, so
          // route it to the non-retry-framed copy instead of collapsing
          // it into the transient "flaky connection" bucket.
          throw new ItineraryActionError(
            error.code ? "save_rejected" : "save_failed"
          );
        }
        return data as ItineraryItem;
      }
    );

    return { ok: true, item };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    if (err instanceof ItineraryActionError) {
      return { ok: false, errorKey: itineraryErrorKey(err.reason) };
    }
    console.error("[itinerary] addItineraryItem unexpected:", err);
    return { ok: false, errorKey: "itinerary_save_failed" };
  }
}

// ---------------------------------------------------------------------------
// updateItineraryItem
// ---------------------------------------------------------------------------

export interface UpdateItineraryItemInput {
  itemId: string;
  title?: string;
  kind?: (typeof ITINERARY_ITEM_KIND)[number];
  day?: string;
  startTime?: string | null;
  endTime?: string | null;
  location?: string | null;
  address?: string | null;
  addressPlaceId?: string | null;
  addressProvider?: "google" | null;
  notes?: string | null;
  costCents?: number | null;
  currency?: string;
  activityTag?: string[];
  dressCode?: string | null;
  visibility?: "everyone" | "organizers_only" | "hide_from_celebrant" | "custom";
}

/**
 * Update an itinerary item. Organizer-only via RLS.
 * Idempotency key is required for replay safety on flaky connections.
 */
export async function updateItineraryItem(
  input: UpdateItineraryItemInput,
  idempotencyKey: string
): Promise<UpdateItineraryItemResult> {
  const keyParse = IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey);
  if (!keyParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const parsed = updateItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "rls_denied" };
  }
  const userId = authData.user.id;

  const { itemId, ...fields } = parsed.data;

  // Fix B (P0): same trip-tz reduction as addItineraryItem. Only fetch the
  // item's trip + the trip's timezone (two extra round-trips) when a time
  // field was actually provided in this update.
  let tripTimezone: string | null = null;
  if (fields.startTime !== undefined || fields.endTime !== undefined) {
    const existingItem = await getItineraryItem(supabase, itemId);
    if (!existingItem) {
      return { ok: false, errorKey: "rls_denied" };
    }
    const trip = await getTripById(supabase, existingItem.trip_id);
    if (!trip) {
      return { ok: false, errorKey: "rls_denied" };
    }
    tripTimezone = trip.timezone;
  }

  // Build partial update payload — only include fields that were provided
  const updatePayload: Record<string, unknown> = {
    idempotency_key: idempotencyKey,
  };
  if (fields.title !== undefined) updatePayload.title = fields.title;
  if (fields.kind !== undefined) updatePayload.kind = fields.kind;
  if (fields.day !== undefined) updatePayload.day = fields.day;
  if (fields.startTime !== undefined) {
    updatePayload.start_time =
      fields.startTime == null ? null : isoToDbTime(fields.startTime, tripTimezone!);
  }
  if (fields.endTime !== undefined) {
    updatePayload.end_time =
      fields.endTime == null ? null : isoToDbTime(fields.endTime, tripTimezone!);
    // #504: end_day rides along with every endTime write (and clears with it).
    updatePayload.end_day =
      fields.endTime == null ? null : isoToDbDate(fields.endTime, tripTimezone!);
  }
  if (fields.location !== undefined) updatePayload.location = fields.location;
  if (fields.address !== undefined) updatePayload.address = fields.address;
  if (fields.addressPlaceId !== undefined) updatePayload.address_place_id = fields.addressPlaceId;
  if (fields.addressProvider !== undefined) updatePayload.address_provider = fields.addressProvider;
  if (fields.notes !== undefined) updatePayload.notes = fields.notes;
  if (fields.costCents !== undefined) updatePayload.cost_cents = fields.costCents;
  if (fields.currency !== undefined) updatePayload.currency = fields.currency;
  if (fields.activityTag !== undefined) updatePayload.activity_tag = fields.activityTag;
  if (fields.dressCode !== undefined) updatePayload.dress_code = fields.dressCode;
  if (fields.visibility !== undefined) updatePayload.visibility = fields.visibility;

  try {
    const item = await rateLimitedAction(
      RATE_LIMIT_SCOPES.CREATE_ITINERARY_ITEM,
      userId,
      async () => {
        const { data, error } = await supabase
          .from("itinerary_items")
          .update(updatePayload)
          .eq("id", itemId)
          .select(
            "id, trip_id, day, start_time, end_time, end_day, title, location, address, address_place_id, address_provider, notes, cost_cents, currency, created_by, created_at, updated_at, visibility, kind, activity_tag, dress_code, idempotency_key"
          )
          .single();

        if (error) {
          if (error.code === "42501" || error.code === "PGRST116") {
            throw new ItineraryActionError("rls_denied");
          }
          // #474: see addItineraryItem — a coded Postgres/PostgREST error
          // is a deterministic rejection, not a flaky connection.
          throw new ItineraryActionError(
            error.code ? "save_rejected" : "save_failed"
          );
        }
        return data as ItineraryItem;
      }
    );

    return { ok: true, item };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    if (err instanceof ItineraryActionError) {
      return { ok: false, errorKey: itineraryErrorKey(err.reason) };
    }
    console.error("[itinerary] updateItineraryItem unexpected:", err);
    return { ok: false, errorKey: "itinerary_save_failed" };
  }
}

// ---------------------------------------------------------------------------
// deleteItineraryItem
// ---------------------------------------------------------------------------

/**
 * Delete an itinerary item. Organizer-only via RLS.
 * No idempotency key — deletes are naturally idempotent (second call
 * hits a row that's already gone and RLS returns no rows → treated
 * as success at the UI layer).
 */
export async function deleteItineraryItem(
  itemId: string
): Promise<DeleteItineraryItemResult> {
  const parsedId = z.string().uuid().safeParse(itemId);
  if (!parsedId.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "rls_denied" };
  }

  try {
    const { error } = await supabase
      .from("itinerary_items")
      .delete()
      .eq("id", parsedId.data);

    if (error) {
      if (error.code === "42501") {
        return { ok: false, errorKey: "rls_denied" };
      }
      console.error("[itinerary] deleteItineraryItem failed:", error.message);
      return { ok: false, errorKey: "itinerary_delete_failed" };
    }

    return { ok: true };
  } catch (err) {
    console.error("[itinerary] deleteItineraryItem unexpected:", err);
    return { ok: false, errorKey: "itinerary_delete_failed" };
  }
}

// ---------------------------------------------------------------------------
// Internal error sentinel
// ---------------------------------------------------------------------------

type ItineraryErrorReason = "save_failed" | "save_rejected" | "rls_denied";

class ItineraryActionError extends Error {
  readonly reason: ItineraryErrorReason;

  constructor(reason: ItineraryErrorReason) {
    super(`itinerary_action_error:${reason}`);
    this.name = "ItineraryActionError";
    this.reason = reason;
  }
}

// #474: maps the internal sentinel reason to the copy-table key. Kept as a
// single function so both addItineraryItem and updateItineraryItem stay
// in lockstep — a new reason can't be added to one call site without a
// compiler error surfacing here.
function itineraryErrorKey(reason: ItineraryErrorReason): ErrorKey {
  switch (reason) {
    case "rls_denied":
      return "rls_denied";
    case "save_rejected":
      return "itinerary_save_rejected";
    case "save_failed":
      return "itinerary_save_failed";
  }
}
