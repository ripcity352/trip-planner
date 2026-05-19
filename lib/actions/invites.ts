"use server";

/**
 * Server actions for the invite flow (#73).
 *
 * Surface contract — every action returns a discriminated union on
 * failure (`{ ok: false, errorKey }`) so the UI can surface the
 * matching toast from `lib/copy/errors.ts`. Success either redirects
 * (acceptInviteAction) or returns the freshly-inserted row.
 */

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createInviteRecord, revokeInvite } from "@/lib/db/invites";
import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  rateLimitedAction,
} from "@/lib/rate-limit";
import type { ErrorKey } from "@/lib/copy/errors";
import type { Invite } from "@/lib/db/types";

// ---------- types ----------

export type AcceptInviteResult =
  | { ok: true; tripSlug: string }
  | { ok: false; errorKey: ErrorKey };

export type CreateInviteResult =
  | { ok: true; invite: Invite }
  | { ok: false; errorKey: ErrorKey };

export type RevokeInviteResult =
  | { ok: true }
  | { ok: false; errorKey: ErrorKey };

export interface CreateInviteActionInput {
  tripId: string;
  usesLeft: number | null;
  expiresAt: string | null;
}

// ---------- helpers ----------

/**
 * Map a Postgres / Supabase RPC error from `accept_invite` to a
 * user-facing ErrorKey.
 *
 * Security note (anti-enumeration): the SQL function distinguishes
 * `invite_not_found` (P0002), `invite_expired` (P0001), and
 * `invite_exhausted` (P0001) — those distinctions are useful for
 * internal observability, but surfacing them to a hostile prober turns
 * the endpoint into an oracle:
 *
 *   - "expired" vs "not_found" → "this token existed at some point"
 *   - "exhausted" vs "not_found" → "this token was a single-use that
 *     got used" → leaks ground truth about a specific invite's lifecycle
 *
 * We collapse all three to `invite_not_found` for the user, and log
 * the original SQLSTATE / message at the call site for debugging.
 *
 *   - 42501 (insufficient_privilege) → auth_failed
 *   - anything else → network (the user can retry; Sentry has the trace)
 */
function mapRpcErrorToKey(error: {
  message?: string;
  code?: string;
} | null): ErrorKey {
  if (!error) return "network";
  if (error.code === "42501") {
    return "auth_failed";
  }
  const msg = error.message ?? "";
  if (
    error.code === "P0002" ||
    error.code === "P0001" ||
    msg.includes("invite_not_found") ||
    msg.includes("invite_expired") ||
    msg.includes("invite_exhausted")
  ) {
    // Distinguished only in server logs — see acceptInviteAction.
    return "invite_not_found";
  }
  return "network";
}

/**
 * Validation for `createInviteAction`. Reject negative / zero uses and
 * past expiry timestamps at the server boundary — the database doesn't
 * enforce these (the columns are nullable for "unlimited" / "no expiry")
 * so the action layer is the chokepoint.
 *
 * `usesLeft = null` means unlimited; positive integer with a cap so a
 * client can't ask for a 9-quadrillion-use link.
 */
const createInviteSchema = z.object({
  tripId: z.string().uuid(),
  usesLeft: z.number().int().positive().max(1000).nullable().optional(),
  expiresAt: z
    .string()
    .datetime()
    .refine((iso) => new Date(iso).getTime() > Date.now(), {
      message: "expiresAt must be in the future",
    })
    .nullable()
    .optional(),
});

// ---------- actions ----------

/**
 * Accept an invite. Calls the `accept_invite(token, idempotency_key)`
 * SECURITY DEFINER RPC, then looks up the trip's slug so we can
 * redirect the caller to `/trips/<slug>`.
 *
 * Idempotency: the RPC enforces it via the partial unique index on
 * `trip_members (trip_id, idempotency_key)`. Replaying with the same
 * key returns the existing membership row; we still redirect.
 */
export async function acceptInviteAction(
  token: string,
  idempotencyKey: string
): Promise<AcceptInviteResult | never> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "auth_failed" };
  }
  const userId = authData.user.id;

  let memberId: string;
  try {
    memberId = await rateLimitedAction(
      RATE_LIMIT_SCOPES.ACCEPT_INVITE,
      userId,
      async () => {
        const { data, error } = await supabase.rpc("accept_invite", {
          p_token: token,
          p_idempotency_key: idempotencyKey,
        });
        if (error) {
          // Log the SQLSTATE-distinguished reason server-side so we can
          // tell apart "never existed" / "expired" / "exhausted" in
          // logs without ever surfacing that distinction to the user.
          // See mapRpcErrorToKey for the anti-enumeration rationale.
          console.error("[invites] accept_invite RPC failed:", {
            code: error.code,
            message: error.message,
          });
          const errorKey = mapRpcErrorToKey(error);
          // Throw a tagged error so the outer try/catch can map back to
          // the discriminated-union shape. We bake the key onto the
          // message so it survives the type erasure.
          throw new TaggedRpcError(errorKey);
        }
        return data as string;
      }
    );
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    if (err instanceof TaggedRpcError) {
      return { ok: false, errorKey: err.errorKey };
    }
    console.error("[invites] acceptInvite unexpected failure:", err);
    return { ok: false, errorKey: "network" };
  }

  // Look up the trip slug so the redirect lands on the friendly URL.
  // We use trip_members → trips here; the membership row was just
  // created (or already existed), so RLS lets us read it.
  let slug: string | null = null;
  try {
    const { data: memberRow } = await supabase
      .from("trip_members")
      .select("trip_id")
      .eq("id", memberId)
      .maybeSingle();

    if (memberRow?.trip_id) {
      const { data: tripRow } = await supabase
        .from("trips")
        .select("slug")
        .eq("id", memberRow.trip_id)
        .maybeSingle();
      slug = (tripRow as { slug?: string } | null)?.slug ?? null;
    }
  } catch {
    // Fall through — we'll surface a recoverable error below.
  }

  if (!slug) {
    return { ok: false, errorKey: "network" };
  }

  redirect(`/trips/${slug}`);
}

/**
 * Create an invite link for a trip. RLS gates this to organizers.
 * Rate-limited under the `acceptInvite` scope — the bucket is shared
 * with the accept path, which is the right call for now (a burst of
 * mint/accept activity is the same throttle target).
 */
export async function createInviteAction(
  input: CreateInviteActionInput
): Promise<CreateInviteResult> {
  // Validate first — reject usesLeft <= 0, capped >1000, and any
  // expires_at already in the past. The DB columns don't enforce
  // these (they're nullable to mean "unlimited" / "never"), so the
  // action layer is the only chokepoint.
  const parsed = createInviteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "auth_failed" };
  }
  const userId = authData.user.id;

  try {
    const invite = await rateLimitedAction(
      RATE_LIMIT_SCOPES.ACCEPT_INVITE,
      userId,
      () =>
        createInviteRecord(
          supabase,
          parsed.data.tripId,
          parsed.data.usesLeft ?? null,
          parsed.data.expiresAt ?? null,
          userId
        )
    );
    return { ok: true, invite };
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    // RLS rejection surfaces as a Postgres-class error with code 42501.
    // We don't have a typed Supabase error here, so heuristic on
    // message; misclassifying as `network` is acceptable for v1 because
    // the form recovers the same way.
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("RLS") || message.includes("42501")) {
      return { ok: false, errorKey: "rls_denied" };
    }
    return { ok: false, errorKey: "network" };
  }
}

/**
 * Revoke an invite by clamping `expires_at` to `now()`. We don't delete
 * the row so the next click still surfaces "this link was revoked"
 * (rendered as `invite_expired`).
 */
export async function revokeInviteAction(
  token: string
): Promise<RevokeInviteResult> {
  try {
    const supabase = await createClient();
    await revokeInvite(supabase, token);
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("RLS") || message.includes("42501")) {
      return { ok: false, errorKey: "rls_denied" };
    }
    return { ok: false, errorKey: "network" };
  }
}

// ---------- internal ----------

/**
 * Internal sentinel: lets the rate-limited inner closure throw an
 * already-classified ErrorKey out to the outer try/catch without
 * shadowing real errors. Keeping it inside this module (no export)
 * means callers don't accidentally `instanceof`-match it elsewhere.
 */
class TaggedRpcError extends Error {
  readonly errorKey: ErrorKey;
  constructor(errorKey: ErrorKey) {
    super(`tagged_rpc_error:${errorKey}`);
    this.errorKey = errorKey;
  }
}
