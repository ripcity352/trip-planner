"use server";

/**
 * Server actions for travel legs (M3 #37 — arrivals manifest).
 *
 * Surface contract:
 *   - `upsertTravelLeg(input, idempotencyKey)` inserts or updates the
 *     caller's own travel leg.
 *   - `deleteTravelLeg(legId)` deletes the caller's own leg.
 *   - Strictly owner-only write: `trip_member_id` is resolved server-side
 *     from auth.uid() — callers cannot create/edit legs for others.
 *   - Idempotency scope: (trip_id, trip_member_id, idempotency_key)
 *     per the strictly-user-tables ADR.
 *   - READ is trip-wide (all members see the arrivals manifest) —
 *     handled in lib/db/travel-legs.ts.
 *
 * M4 W2c: adds `airlineIata` (^[A-Z0-9]{2}$) and `flightNumber`
 * (^[A-Z0-9]{1,8}$) to the upsert schema. Both are optional.
 *
 * #477 two-section model: every leg is `inbound` (getting there — the
 * trip-city ARRIVAL instant is required) or `outbound` (heading home —
 * the trip-city DEPARTURE instant is required). `airport` is free text
 * on either direction; `originLabel` ("Coming from") is inbound-only.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  rateLimitedAction,
} from "@/lib/rate-limit";
import type { ErrorKey } from "@/lib/copy/errors";
import type { TravelLeg } from "@/lib/db/types";

const TRAVEL_LEG_KIND = ["flight", "train", "drive", "other"] as const;
const TRAVEL_LEG_DIRECTION = ["inbound", "outbound"] as const;

// #478/#479 sentinel issue messages. The client mirrors these rules with
// user-facing copy; here the message is a machine marker that
// upsertSchemaErrorKey maps to a dedicated ErrorKey (the UI renders the
// user-facing string from ERRORS).
const TIME_REQUIRED_ISSUE = "travel_leg_time_required";
const TIMES_REVERSED_ISSUE = "travel_leg_times_reversed";

const upsertLegSchema = z
  .object({
    tripId: z.string().uuid(),
    kind: z.enum(TRAVEL_LEG_KIND),
    // #477: required — a leg is either getting there or heading home.
    direction: z.enum(TRAVEL_LEG_DIRECTION),
    departAt: z.string().nullable().optional(),
    arriveAt: z.string().nullable().optional(),
    // #477: free-text airport, e.g. "LAX". No validation, no place-ids.
    airport: z.string().trim().max(100).nullable().optional(),
    // #477: "Coming from" — inbound-only (see superRefine below).
    originLabel: z.string().trim().max(120).nullable().optional(),
    carrier: z.string().trim().max(100).nullable().optional(),
    confirmationCode: z.string().trim().max(100).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
    // Optional: if provided, used to update an existing leg row.
    legId: z.string().uuid().nullable().optional(),
    // M4 W2c: airline IATA code and flight number
    airlineIata: z
      .string()
      .regex(/^[A-Z0-9]{2}$/)
      .nullable()
      .optional(),
    flightNumber: z
      .string()
      .regex(/^[A-Z0-9]{1,8}$/)
      .nullable()
      .optional(),
  })
  // #248: cross-field guard. airlineIata + flightNumber are flight-only;
  // any non-flight kind with either field populated is rejected. The form
  // ALSO clears these in onSubmit when kind switches off flight (belt +
  // suspenders) — this is the load-bearing server check.
  .superRefine((data, ctx) => {
    if (data.kind === "flight") return;
    if (data.airlineIata != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["airlineIata"],
        message: "airlineIata is only valid when kind is 'flight'",
      });
    }
    if (data.flightNumber != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["flightNumber"],
        message: "flightNumber is only valid when kind is 'flight'",
      });
    }
  })
  // #477: originLabel ("Coming from") is inbound-only — mirrors the
  // flight-only pattern above for airlineIata/flightNumber.
  .superRefine((data, ctx) => {
    if (data.direction === "inbound") return;
    if (data.originLabel != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["originLabel"],
        message: "originLabel is only valid when direction is 'inbound'",
      });
    }
  })
  // #477/#478/#479: time rules — the load-bearing server gate; the client
  // form mirrors the required-time rule for inline UX.
  .superRefine((data, ctx) => {
    const departAt = data.departAt ?? "";
    const arriveAt = data.arriveAt ?? "";

    // #477 (supersedes the #478 "at least one time" gate): each direction
    // records its trip-city-side instant — inbound legs need the arrival,
    // outbound legs need the departure. Same sentinel/key as #478.
    if (data.direction === "inbound" && !arriveAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["arriveAt"],
        message: TIME_REQUIRED_ISSUE,
      });
      return;
    }
    if (data.direction === "outbound" && !departAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["departAt"],
        message: TIME_REQUIRED_ISSUE,
      });
      return;
    }

    // #479 (vestigial post-#477 — the form only ever submits one time per
    // direction, but this guards hand-crafted payloads; do not delete):
    // when both are present, arrive must be >= depart. Values are
    // UTC ISO instants, so numeric comparison is TZ-safe; equal timestamps
    // and red-eye overnights pass. Unparseable strings are left alone —
    // out of scope here (Postgres rejects them as a coded error).
    if (departAt && arriveAt) {
      const departMs = Date.parse(departAt);
      const arriveMs = Date.parse(arriveAt);
      if (
        !Number.isNaN(departMs) &&
        !Number.isNaN(arriveMs) &&
        arriveMs < departMs
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["arriveAt"],
          message: TIMES_REVERSED_ISSUE,
        });
      }
    }
  });

const IDEMPOTENCY_KEY_SCHEMA = z.string().uuid();

/**
 * #478/#479: map a failed upsert parse to an error key. The dedicated
 * time keys only fire when the time rules are the ONLY problem — a mixed
 * failure (e.g. bad kind AND no times) stays on the generic key, since a
 * field-specific message would hide the other problem.
 */
function upsertSchemaErrorKey(error: z.ZodError): ErrorKey {
  const messages = error.issues.map((issue) => issue.message);
  const allTimeIssues = messages.every(
    (message) =>
      message === TIME_REQUIRED_ISSUE || message === TIMES_REVERSED_ISSUE
  );
  if (!allTimeIssues) return "validation_failed";
  return messages.includes(TIME_REQUIRED_ISSUE)
    ? "travel_leg_time_required"
    : "travel_leg_times_reversed";
}

export interface UpsertTravelLegInput {
  tripId: string;
  kind: (typeof TRAVEL_LEG_KIND)[number];
  /** #477: inbound = getting there (arriveAt required); outbound = heading home (departAt required). */
  direction: (typeof TRAVEL_LEG_DIRECTION)[number];
  departAt?: string | null;
  arriveAt?: string | null;
  /** #477: free-text airport, e.g. "LAX". */
  airport?: string | null;
  /** #477: "Coming from" — inbound-only. */
  originLabel?: string | null;
  carrier?: string | null;
  confirmationCode?: string | null;
  notes?: string | null;
  /** Provide to update an existing leg; omit to insert a new one. */
  legId?: string | null;
  /** M4 W2c: IATA airline code (^[A-Z0-9]{2}$). */
  airlineIata?: string | null;
  /** M4 W2c: flight number (^[A-Z0-9]{1,8}$). */
  flightNumber?: string | null;
}

export type UpsertTravelLegResult =
  | { ok: true; leg: TravelLeg }
  | { ok: false; errorKey: ErrorKey };

export type DeleteTravelLegResult =
  | { ok: true }
  | { ok: false; errorKey: ErrorKey };

const TRAVEL_LEG_COLUMNS =
  "id, trip_id, trip_member_id, kind, depart_at, arrive_at, carrier, confirmation_code, notes, idempotency_key, created_at, airline_iata, flight_number, direction, airport, origin_label, written_by_trip_member_id";

/**
 * Insert a new travel leg or update an existing one (when legId is provided).
 * The caller's trip_member_id is resolved server-side — cannot impersonate.
 */
export async function upsertTravelLeg(
  input: UpsertTravelLegInput,
  idempotencyKey: string
): Promise<UpsertTravelLegResult> {
  const keyParse = IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey);
  if (!keyParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const parsed = upsertLegSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: upsertSchemaErrorKey(parsed.error) };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "rls_denied" };
  }
  const userId = authData.user.id;

  const {
    tripId,
    kind,
    direction,
    departAt,
    arriveAt,
    airport,
    originLabel,
    carrier,
    confirmationCode,
    notes,
    legId,
    airlineIata,
    flightNumber,
  } = parsed.data;

  // Resolve the caller's trip_member_id
  let tripMemberId: string;
  try {
    const { data: memberData, error: memberError } = await supabase
      .from("trip_members")
      .select("id")
      .eq("trip_id", tripId)
      .eq("user_id", userId)
      .maybeSingle();

    if (memberError || !memberData) {
      return { ok: false, errorKey: "rls_denied" };
    }
    tripMemberId = (memberData as { id: string }).id;
  } catch (err) {
    console.error("[travel-legs] member lookup unexpected:", err);
    return { ok: false, errorKey: "travel_leg_save_failed" };
  }

  try {
    const leg = await rateLimitedAction(
      RATE_LIMIT_SCOPES.UPSERT_TRAVEL_LEG,
      userId,
      async () => {
        if (legId) {
          // Update existing leg (must be the owner — RLS enforces this)
          const { data, error } = await supabase
            .from("travel_legs")
            .update({
              kind,
              direction,
              depart_at: departAt ?? null,
              arrive_at: arriveAt ?? null,
              airport: airport ?? null,
              origin_label: originLabel ?? null,
              carrier: carrier ?? null,
              confirmation_code: confirmationCode ?? null,
              notes: notes ?? null,
              idempotency_key: idempotencyKey,
              airline_iata: airlineIata ?? null,
              flight_number: flightNumber ?? null,
              // #574: editing your own leg ADOPTS it — any prior
              // co-traveler-tag attribution is cleared. The tightened
              // owner-update WITH CHECK requires written_by NULL, so an
              // edit of a still-pending tag would otherwise be denied; this
              // makes an edit an implicit confirm (same shape as the
              // dedicated confirmTaggedLeg action).
              written_by_trip_member_id: null,
            })
            .eq("id", legId)
            .eq("trip_member_id", tripMemberId)
            .select(TRAVEL_LEG_COLUMNS)
            .single();

          if (error) {
            if (error.code === "42501" || error.code === "PGRST116") {
              throw new TravelLegError("rls_denied");
            }
            // #474: a coded Postgres/PostgREST error is a deterministic
            // rejection, not a flaky connection — see itinerary.ts.
            throw new TravelLegError(
              error.code ? "save_rejected" : "save_failed"
            );
          }
          return data as TravelLeg;
        }

        // Insert new leg
        const { data, error } = await supabase
          .from("travel_legs")
          .insert({
            trip_id: tripId,
            trip_member_id: tripMemberId,
            kind,
            direction,
            depart_at: departAt ?? null,
            arrive_at: arriveAt ?? null,
            airport: airport ?? null,
            origin_label: originLabel ?? null,
            carrier: carrier ?? null,
            confirmation_code: confirmationCode ?? null,
            notes: notes ?? null,
            idempotency_key: idempotencyKey,
            airline_iata: airlineIata ?? null,
            flight_number: flightNumber ?? null,
          })
          .select(TRAVEL_LEG_COLUMNS)
          .single();

        if (error) {
          // Idempotency replay
          if (error.code === "23505") {
            const { data: existing, error: fetchError } = await supabase
              .from("travel_legs")
              .select(TRAVEL_LEG_COLUMNS)
              .eq("trip_id", tripId)
              .eq("trip_member_id", tripMemberId)
              .eq("idempotency_key", idempotencyKey)
              .single();

            if (fetchError) throw new TravelLegError("save_failed");
            return existing as TravelLeg;
          }
          if (error.code === "42501") {
            throw new TravelLegError("rls_denied");
          }
          // #474: see the insert-branch comment above.
          throw new TravelLegError(
            error.code ? "save_rejected" : "save_failed"
          );
        }
        return data as TravelLeg;
      }
    );

    return { ok: true, leg };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    if (err instanceof TravelLegError) {
      return { ok: false, errorKey: travelLegErrorKey(err.reason) };
    }
    console.error("[travel-legs] upsertTravelLeg unexpected:", err);
    return { ok: false, errorKey: "travel_leg_save_failed" };
  }
}

/**
 * Delete the caller's own travel leg. RLS prevents deleting another
 * member's leg. Idempotent — if the leg is already gone, returns ok: true.
 */
export async function deleteTravelLeg(
  legId: string
): Promise<DeleteTravelLegResult> {
  const parsedId = z.string().uuid().safeParse(legId);
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
      .from("travel_legs")
      .delete()
      .eq("id", parsedId.data);

    if (error) {
      if (error.code === "42501") {
        return { ok: false, errorKey: "rls_denied" };
      }
      console.error("[travel-legs] deleteTravelLeg failed:", error.message);
      return { ok: false, errorKey: "travel_leg_delete_failed" };
    }

    return { ok: true };
  } catch (err) {
    console.error("[travel-legs] deleteTravelLeg unexpected:", err);
    return { ok: false, errorKey: "travel_leg_delete_failed" };
  }
}

// =============================================================
// #574 — co-traveler tagging (shared flights)
// =============================================================
// Fan-out: the caller (the person who logged the flight) tags the OTHER
// members on it. Each tag INSERTs a pending, ATTRIBUTED travel_legs row for
// the tagged member (written_by = the caller's own trip_member_id). The
// tagged member confirms (adopts — confirmTaggedLeg clears attribution) or
// dismisses (deleteTravelLeg — it's their own row). Not organizer-gated: any
// trip member may tag; the confirm gate + forgery-proof RLS make it safe.
// PNR privacy (#505): confirmation_code and notes are NEVER copied — each
// traveler keeps their own. See notes/decisions.md 2026-08-10 #574 ADR.

const tagCoTravelersSchema = z
  .object({
    tripId: z.string().uuid(),
    // The members to tag onto the flight. Bounded — a plausible shared
    // flight is a handful of people, not the whole trip twice over.
    targetTripMemberIds: z.array(z.string().uuid()).min(1).max(30),
    // Tagging is flight-only for MVP (per ADR) — the shareable facts below
    // are the airline-confirmation fields.
    kind: z.literal("flight"),
    direction: z.enum(TRAVEL_LEG_DIRECTION),
    departAt: z.string().nullable().optional(),
    arriveAt: z.string().nullable().optional(),
    airport: z.string().trim().max(100).nullable().optional(),
    originLabel: z.string().trim().max(120).nullable().optional(),
    carrier: z.string().trim().max(100).nullable().optional(),
    airlineIata: z
      .string()
      .regex(/^[A-Z0-9]{2}$/)
      .nullable()
      .optional(),
    flightNumber: z
      .string()
      .regex(/^[A-Z0-9]{1,8}$/)
      .nullable()
      .optional(),
  })
  // Mirror the upsert direction-time gate: a shared inbound flight needs the
  // arrival, a shared outbound the departure (defense-in-depth — the client
  // only ever tags off an already-saved, valid leg).
  .superRefine((data, ctx) => {
    if (data.direction === "inbound" && !(data.arriveAt ?? "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["arriveAt"],
        message: TIME_REQUIRED_ISSUE,
      });
    }
    if (data.direction === "outbound" && !(data.departAt ?? "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["departAt"],
        message: TIME_REQUIRED_ISSUE,
      });
    }
  })
  // #477: originLabel is inbound-only.
  .superRefine((data, ctx) => {
    if (data.direction !== "inbound" && data.originLabel != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["originLabel"],
        message: "originLabel is only valid when direction is 'inbound'",
      });
    }
  });

export interface TagCoTravelersInput {
  tripId: string;
  targetTripMemberIds: string[];
  kind: "flight";
  direction: (typeof TRAVEL_LEG_DIRECTION)[number];
  departAt?: string | null;
  arriveAt?: string | null;
  airport?: string | null;
  originLabel?: string | null;
  carrier?: string | null;
  airlineIata?: string | null;
  flightNumber?: string | null;
}

export type TagCoTravelersResult =
  | { ok: true; tagged: number }
  | { ok: false; errorKey: ErrorKey };

/**
 * Tag co-travelers onto a shared flight — one pending, attributed leg per
 * target. The caller's trip_member_id is resolved server-side and used as
 * `written_by`; callers cannot forge attribution (RLS enforces
 * writer-binding + anti-forgery + tenancy on top of this).
 *
 * Idempotent: the same `idempotencyKey` is reused across the fan-out (unique
 * per (trip_id, trip_member_id, idempotency_key)), so a double-tap replays
 * to the existing rows rather than duplicating. Self and duplicate targets
 * are dropped before the write (RLS also rejects target == writer).
 *
 * Partial-success semantics: a per-target 42501 (a target that stopped being
 * taggable between load and submit — e.g. removed from the trip) is SKIPPED,
 * not fatal, so one stale target can't block tagging everyone else; it just
 * doesn't get a pending leg. Any other coded error fails the whole call.
 */
export async function tagCoTravelersAction(
  input: TagCoTravelersInput,
  idempotencyKey: string
): Promise<TagCoTravelersResult> {
  const keyParse = IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey);
  if (!keyParse.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const parsed = tagCoTravelersSchema.safeParse(input);
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
    targetTripMemberIds,
    direction,
    departAt,
    arriveAt,
    airport,
    originLabel,
    carrier,
    airlineIata,
    flightNumber,
  } = parsed.data;

  // Resolve the caller's own membership — this is the `written_by`
  // attribution (RLS re-derives and binds it; resolving here also lets us
  // drop self-targets cleanly rather than surface a confusing RLS denial).
  let writerMemberId: string;
  try {
    const { data: memberData, error: memberError } = await supabase
      .from("trip_members")
      .select("id")
      .eq("trip_id", tripId)
      .eq("user_id", userId)
      .maybeSingle();

    if (memberError || !memberData) {
      return { ok: false, errorKey: "rls_denied" };
    }
    writerMemberId = (memberData as { id: string }).id;
  } catch (err) {
    console.error("[travel-legs] tag caller lookup unexpected:", err);
    return { ok: false, errorKey: "travel_leg_save_failed" };
  }

  // Drop self + duplicates (RLS rejects target == writer anyway).
  const targets = Array.from(new Set(targetTripMemberIds)).filter(
    (id) => id !== writerMemberId
  );
  if (targets.length === 0) {
    return { ok: false, errorKey: "validation_failed" };
  }

  // Shareable flight facts only — NEVER confirmation_code or notes (#505:
  // each traveler keeps their own PNR).
  const shared = {
    trip_id: tripId,
    kind: "flight" as const,
    direction,
    depart_at: departAt ?? null,
    arrive_at: arriveAt ?? null,
    airport: airport ?? null,
    origin_label: direction === "inbound" ? (originLabel ?? null) : null,
    carrier: carrier ?? null,
    confirmation_code: null,
    notes: null,
    airline_iata: airlineIata ?? null,
    flight_number: flightNumber ?? null,
    idempotency_key: idempotencyKey,
    written_by_trip_member_id: writerMemberId,
  };

  try {
    const tagged = await rateLimitedAction(
      RATE_LIMIT_SCOPES.TAG_CO_TRAVELERS,
      userId,
      async () => {
        let count = 0;
        // Per-target insert so one target's idempotency replay (23505) or a
        // single RLS rejection doesn't abort the whole batch.
        for (const targetId of targets) {
          const { error } = await supabase
            .from("travel_legs")
            .insert({ ...shared, trip_member_id: targetId });

          if (!error) {
            count += 1;
            continue;
          }
          // 23505 — this target already has a leg under this key: a replay.
          // Count it as tagged (idempotent) and move on.
          if (error.code === "23505") {
            count += 1;
            continue;
          }
          // 42501 — RLS rejected THIS target specifically. Candidates are
          // pre-filtered, so the realistic cause is a target that stopped
          // being taggable between page load and submit (e.g. removed from
          // the trip). SKIP it rather than aborting the whole batch — a
          // stale target must not block tagging everyone else. It simply
          // doesn't get a pending leg (uncounted); no partial-write dead-end.
          if (error.code === "42501") {
            continue;
          }
          // #474: any other coded error is a deterministic rejection of the
          // whole operation (not a per-target staleness) — surface it.
          throw new TravelLegError(error.code ? "save_rejected" : "save_failed");
        }
        return count;
      }
    );

    return { ok: true, tagged };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    if (err instanceof TravelLegError) {
      return { ok: false, errorKey: travelLegErrorKey(err.reason) };
    }
    console.error("[travel-legs] tagCoTravelersAction unexpected:", err);
    return { ok: false, errorKey: "travel_leg_save_failed" };
  }
}

export type ConfirmTaggedLegResult =
  | { ok: true }
  | { ok: false; errorKey: ErrorKey };

/**
 * Confirm ("I'm on it") a pending co-traveler tag: the tagged member adopts
 * the leg by clearing its attribution (`written_by_trip_member_id → null`).
 * RLS owner-update guarantees the caller can only touch their OWN row and
 * that the post-state carries null attribution. Idempotent — clearing an
 * already-confirmed row is a harmless no-op (0 rows affected → still ok).
 *
 * Dismiss ("Not me") is `deleteTravelLeg` — a pending tag is the tagged
 * member's own row, so the existing owner-only delete covers it (no separate
 * action needed).
 *
 * Rate bucket: deliberately reuses UPSERT_TRAVEL_LEG (not TAG_CO_TRAVELERS) —
 * confirm is a light write on the member's OWN leg (adopting it), the same
 * shape as an edit, and it's low-frequency (one tap per pending tag). The
 * TAG_CO_TRAVELERS bucket exists to isolate the fan-out sender's burst; the
 * adopting member has no such burst profile.
 */
export async function confirmTaggedLeg(
  legId: string
): Promise<ConfirmTaggedLegResult> {
  const parsedId = z.string().uuid().safeParse(legId);
  if (!parsedId.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "rls_denied" };
  }
  const userId = authData.user.id;

  try {
    await rateLimitedAction(
      RATE_LIMIT_SCOPES.UPSERT_TRAVEL_LEG,
      userId,
      async () => {
        const { error } = await supabase
          .from("travel_legs")
          .update({ written_by_trip_member_id: null })
          .eq("id", parsedId.data);

        if (error) {
          if (error.code === "42501") {
            throw new TravelLegError("rls_denied");
          }
          throw new TravelLegError(
            error.code ? "save_rejected" : "save_failed"
          );
        }
      }
    );
    return { ok: true };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    if (err instanceof TravelLegError) {
      return { ok: false, errorKey: travelLegErrorKey(err.reason) };
    }
    console.error("[travel-legs] confirmTaggedLeg unexpected:", err);
    return { ok: false, errorKey: "travel_leg_save_failed" };
  }
}

type TravelLegErrorReason = "save_failed" | "save_rejected" | "rls_denied";

class TravelLegError extends Error {
  readonly reason: TravelLegErrorReason;

  constructor(reason: TravelLegErrorReason) {
    super(`travel_leg_error:${reason}`);
    this.name = "TravelLegError";
    this.reason = reason;
  }
}

// #474: see itinerary.ts's itineraryErrorKey for the rationale.
function travelLegErrorKey(reason: TravelLegErrorReason): ErrorKey {
  switch (reason) {
    case "rls_denied":
      return "rls_denied";
    case "save_rejected":
      return "travel_leg_save_rejected";
    case "save_failed":
      return "travel_leg_save_failed";
  }
}
