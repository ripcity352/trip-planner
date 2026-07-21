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
  "id, trip_id, trip_member_id, kind, depart_at, arrive_at, carrier, confirmation_code, notes, idempotency_key, created_at, airline_iata, flight_number, direction, airport, origin_label";

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
