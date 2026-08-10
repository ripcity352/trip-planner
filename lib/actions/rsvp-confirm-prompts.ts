"use server";

/**
 * Server actions for organizer-sent RSVP confirm-prompts (#549).
 *
 * The load-bearing rule: an organizer NEVER writes `trip_members.rsvp_status`.
 * They send a pending *ask* ("Dave heard you're in — tap to confirm"); the
 * member's own tap writes the real status via the existing `setRsvpAction`.
 * This module holds the ask lifecycle:
 *
 *   - `sendRsvpConfirmPromptAction` — an ORGANIZER sends / replaces the ask
 *     for a member of their trip, attributed to the organizer (`sent_by`).
 *     Upsert-replace (one active per member → no nudge-spam).
 *   - `confirmRsvpConfirmPromptAction` — the MEMBER's [Confirm]: applies the
 *     prompt's proposed_status through `setRsvpAction` (the only writer of
 *     rsvp_status), then clears the ask.
 *   - `dismissRsvpConfirmPromptAction` — the MEMBER's [Dismiss]: clears the
 *     ask without touching their RSVP.
 *
 * Authorization is enforced at THREE layers on the organizer path: the RLS
 * policies (source of truth — is_trip_organizer + sent_by binding + tenancy),
 * this server-side organizer check (defense-in-depth, rule #11), and Zod.
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
import type { RsvpStatus, TripRole } from "@/lib/db/types";
import { isOrganizerRole } from "@/lib/utils/expense-visibility";
import { getActivePromptForMember } from "@/lib/db/rsvp-confirm-prompts";
import { setRsvpAction } from "@/lib/actions/rsvp";

type ProposableStatus = Exclude<RsvpStatus, "pending">;
const PROPOSABLE_STATUSES = ["going", "maybe", "declined"] as const;
// Compile-time assertion that the runtime tuple exhausts the type.
const _exhaustive: ReadonlyArray<ProposableStatus> = PROPOSABLE_STATUSES;
void _exhaustive;

const NOTE_MAX = 500;
const IDEMPOTENCY_KEY_SCHEMA = z.string().uuid();

const sendSchema = z.object({
  tripId: z.string().uuid(),
  targetTripMemberId: z.string().uuid(),
  proposedStatus: z.enum(PROPOSABLE_STATUSES),
  note: z.string().trim().max(NOTE_MAX).nullable().optional(),
});

export interface SendRsvpPromptInput {
  tripId: string;
  /** The member being asked to confirm (never the caller). */
  targetTripMemberId: string;
  proposedStatus: ProposableStatus;
  note?: string | null;
}

export type RsvpPromptResult =
  | { ok: true }
  | { ok: false; errorKey: ErrorKey };

/** Strip NUL + CR/LF, trim, cap. Mirrors the on-behalf flag note sanitizer. */
function sanitizeNote(value: string | null | undefined): string | null {
  if (value == null) return null;
  const clean = value.replace(/\0/g, "").replace(/[\r\n]+/g, " ").trim().slice(0, NOTE_MAX);
  return clean.length > 0 ? clean : null;
}

/**
 * Resolve the caller's own membership (id + role) for a trip. Returns null
 * if the caller isn't a member (RLS also blocks). Shared by all three actions.
 */
async function resolveCallerMembership(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
  userId: string
): Promise<{ id: string; role: TripRole } | null> {
  const { data } = await supabase
    .from("trip_members")
    .select("id, role")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { id: string; role: TripRole } | null) ?? null;
}

/**
 * Send (or replace) an RSVP confirm-prompt for a member. Organizer-only,
 * attributed to the caller, upsert on the one-active-per-member index.
 */
export async function sendRsvpConfirmPromptAction(
  input: SendRsvpPromptInput,
  idempotencyKey: string
): Promise<RsvpPromptResult> {
  if (!IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey).success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  const { tripId, targetTripMemberId, proposedStatus } = parsed.data;
  const note = sanitizeNote(parsed.data.note);

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "rls_denied" };
  }
  const userId = authData.user.id;

  // Organizer gate (defense-in-depth over RLS) + sender attribution.
  let senderMemberId: string;
  try {
    const caller = await resolveCallerMembership(supabase, tripId, userId);
    if (!caller || !isOrganizerRole(caller.role)) {
      return { ok: false, errorKey: "rls_denied" };
    }
    if (caller.id === targetTripMemberId) {
      // Self-ask — the self path is the normal RSVP toggle. The DB CHECK
      // and RLS also reject this; reject early for a clean message.
      return { ok: false, errorKey: "validation_failed" };
    }
    senderMemberId = caller.id;
  } catch (err) {
    console.error("[rsvp-prompt] caller lookup unexpected:", err);
    return { ok: false, errorKey: "rsvp_prompt_save_failed" };
  }

  // Tenancy: the target must be a member of THIS trip (RLS enforces it too).
  try {
    const { data } = await supabase
      .from("trip_members")
      .select("id")
      .eq("id", targetTripMemberId)
      .eq("trip_id", tripId)
      .maybeSingle();
    if (!data) {
      return { ok: false, errorKey: "rls_denied" };
    }
  } catch (err) {
    console.error("[rsvp-prompt] target lookup unexpected:", err);
    return { ok: false, errorKey: "rsvp_prompt_save_failed" };
  }

  try {
    await rateLimitedAction(RATE_LIMIT_SCOPES.SEND_RSVP_PROMPT, userId, async () => {
      const { error } = await supabase.from("rsvp_confirm_prompts").upsert(
        {
          trip_id: tripId,
          trip_member_id: targetTripMemberId,
          sent_by_trip_member_id: senderMemberId,
          proposed_status: proposedStatus,
          note,
          idempotency_key: idempotencyKey,
        },
        { onConflict: "trip_member_id" }
      );
      if (error) {
        if (error.code === "42501") throw new RsvpPromptError("rls_denied");
        console.error("[rsvp-prompt] upsert failed:", {
          code: error.code,
          message: error.message,
        });
        throw new RsvpPromptError("save_failed");
      }
    });

    revalidatePath("/trips", "layout");
    return { ok: true };
  } catch (err) {
    return mapError(err, "sendRsvpConfirmPromptAction");
  }
}

/**
 * The member's [Confirm]: applies the prompt's proposed_status via the
 * existing setRsvpAction (the ONLY writer of rsvp_status), then clears the
 * ask. The status is read from the DB — the client can't confirm to an
 * arbitrary value through this path (they'd use the normal toggle for that).
 */
export async function confirmRsvpConfirmPromptAction(
  tripId: string,
  expectedStatus: ProposableStatus,
  idempotencyKey: string
): Promise<RsvpPromptResult> {
  if (!z.string().uuid().safeParse(tripId).success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  if (!z.enum(PROPOSABLE_STATUSES).safeParse(expectedStatus).success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  if (!IDEMPOTENCY_KEY_SCHEMA.safeParse(idempotencyKey).success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "rls_denied" };
  }
  const userId = authData.user.id;

  let memberId: string;
  let proposedStatus: ProposableStatus;
  try {
    const caller = await resolveCallerMembership(supabase, tripId, userId);
    if (!caller) return { ok: false, errorKey: "rls_denied" };
    memberId = caller.id;

    const prompt = await getActivePromptForMember(supabase, memberId);
    if (!prompt) {
      // No pending ask — nothing to confirm (already handled / dismissed).
      return { ok: false, errorKey: "validation_failed" };
    }
    // Bind the confirm to what the member actually saw: if an organizer
    // replaced the ask (going → declined) between page load and this tap,
    // the stale banner must not silently write the newer status. The member
    // re-loads and sees the current ask.
    if (prompt.proposedStatus !== expectedStatus) {
      return { ok: false, errorKey: "validation_failed" };
    }
    proposedStatus = prompt.proposedStatus;
  } catch (err) {
    console.error("[rsvp-prompt] confirm lookup unexpected:", err);
    return { ok: false, errorKey: "rsvp_prompt_save_failed" };
  }

  // The member's own tap writes rsvp_status — via the canonical action, so
  // idempotency + rate-limit + revalidate stay identical to a normal toggle.
  const rsvpResult = await setRsvpAction({ tripId, status: proposedStatus }, idempotencyKey);
  if (!rsvpResult.ok) {
    return { ok: false, errorKey: rsvpResult.errorKey };
  }

  // Clear the ask now that the real status matches. Best-effort: if this
  // fails the RSVP still landed; the member sees the (now-accurate) prompt
  // once more and a second confirm is a harmless no-op.
  try {
    await supabase.from("rsvp_confirm_prompts").delete().eq("trip_member_id", memberId);
  } catch (err) {
    console.error("[rsvp-prompt] confirm cleanup failed (non-fatal):", err);
  }

  revalidatePath("/trips", "layout");
  return { ok: true };
}

/**
 * The member's [Dismiss]: clears the ask without touching their RSVP.
 */
export async function dismissRsvpConfirmPromptAction(
  tripId: string
): Promise<RsvpPromptResult> {
  if (!z.string().uuid().safeParse(tripId).success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "rls_denied" };
  }
  const userId = authData.user.id;

  let memberId: string;
  try {
    const caller = await resolveCallerMembership(supabase, tripId, userId);
    if (!caller) return { ok: false, errorKey: "rls_denied" };
    memberId = caller.id;
  } catch (err) {
    console.error("[rsvp-prompt] dismiss lookup unexpected:", err);
    return { ok: false, errorKey: "rsvp_prompt_save_failed" };
  }

  try {
    await rateLimitedAction(RATE_LIMIT_SCOPES.SEND_RSVP_PROMPT, userId, async () => {
      const { error } = await supabase
        .from("rsvp_confirm_prompts")
        .delete()
        .eq("trip_member_id", memberId);
      if (error) {
        if (error.code === "42501") throw new RsvpPromptError("rls_denied");
        throw new RsvpPromptError("save_failed");
      }
    });
    revalidatePath("/trips", "layout");
    return { ok: true };
  } catch (err) {
    return mapError(err, "dismissRsvpConfirmPromptAction");
  }
}

class RsvpPromptError extends Error {
  readonly reason: "save_failed" | "rls_denied";
  constructor(reason: "save_failed" | "rls_denied") {
    super(`rsvp_prompt_error:${reason}`);
    this.name = "RsvpPromptError";
    this.reason = reason;
  }
}

function mapError(err: unknown, where: string): RsvpPromptResult {
  if (err instanceof RateLimitError) {
    return { ok: false, errorKey: "rate_limit" };
  }
  if (err instanceof RsvpPromptError) {
    return {
      ok: false,
      errorKey: err.reason === "rls_denied" ? "rls_denied" : "rsvp_prompt_save_failed",
    };
  }
  console.error(`[rsvp-prompt] ${where} unexpected:`, err);
  return { ok: false, errorKey: "rsvp_prompt_save_failed" };
}
