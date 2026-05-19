"use server";

/**
 * Server actions for trip creation (#72).
 *
 * Surface contract:
 *   - `createTripAction(input, idempotencyKey)` validates with zod,
 *     derives a slug from the name, wraps the DB call in
 *     `rateLimitedAction("createTrip", userId, ...)`, and on success
 *     redirects to `/trips/<slug>` (throws Next's redirect signal).
 *   - On failure it returns a discriminated union — no throwing to
 *     the caller — so the form can surface the matching error toast
 *     from `lib/copy/errors.ts`.
 */

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createTrip } from "@/lib/db/trips";
import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  rateLimitedAction,
} from "@/lib/rate-limit";
import type { ErrorKey } from "@/lib/copy/errors";

export type CreateTripResult =
  | { ok: true; slug: string }
  | { ok: false; errorKey: ErrorKey };

export interface CreateTripActionInput {
  name: string;
  description?: string;
  location?: string;
  starts_at?: string;
  ends_at?: string;
  vibe_tags?: string[];
}

// zod schema. Names are short, dates are optional, vibe_tags are
// strings. We deliberately do NOT enforce starts_at <= ends_at here —
// the DB check constraint catches it and the UI can render the dates
// invalid before submit if it wants. Server-side belt+suspenders is
// fine to skip when the DB has the constraint.
const inputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).optional(),
  location: z.string().trim().max(200).optional(),
  starts_at: z.string().trim().min(1).optional(),
  ends_at: z.string().trim().min(1).optional(),
  vibe_tags: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
});

/**
 * Slugify a trip name. Lowercase, replace non-alphanumerics with `-`,
 * collapse repeats, strip leading/trailing hyphens. Cap at 60 chars.
 * If the result is empty (pure-emoji name), fall back to `trip`.
 */
function slugifyName(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base.length > 0 ? base : "trip";
}

/**
 * Generate a short uuid suffix for collision-avoidance. Lowercase hex,
 * 6 chars. We use `crypto.randomUUID()` so the suffix is unbiased.
 */
function shortRand(): string {
  const id = crypto.randomUUID();
  return id.replace(/-/g, "").slice(0, 6);
}

export async function createTripAction(
  input: CreateTripActionInput,
  idempotencyKey: string
): Promise<CreateTripResult | never> {
  // 1. Validate.
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }

  // 2. Identify the caller. We need their id as the rate-limit key.
  //    `getUser()` (not getSession) hits Supabase to validate the JWT —
  //    required for security-critical reads.
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return { ok: false, errorKey: "auth_failed" };
  }
  const userId = authData.user.id;

  // 3. Generate slug (with one collision-retry suffix). The unique
  //    constraint on `trips.slug` will surface 23505 if we collide on
  //    the suffixed form; we return `trip_create_failed` in that case —
  //    rare in practice and the user can re-submit with a different
  //    name. `idempotencyKey` is currently unused at the DB layer
  //    (the RPC doesn't accept one); reserved for a future scope where
  //    the same client-replay should return the same trip.
  void idempotencyKey;
  const baseSlug = slugifyName(parsed.data.name);
  const slug = baseSlug; // first attempt — collision path adds suffix

  try {
    const created = await rateLimitedAction(
      RATE_LIMIT_SCOPES.CREATE_TRIP,
      userId,
      async () => {
        try {
          return await createTrip(supabase, {
            slug,
            name: parsed.data.name,
            description: parsed.data.description ?? null,
            location: parsed.data.location ?? null,
            starts_at: parsed.data.starts_at ?? null,
            ends_at: parsed.data.ends_at ?? null,
            vibe_tags: parsed.data.vibe_tags ?? null,
          });
        } catch (err) {
          // Slug collision retry: tack on a short random suffix once.
          const message = err instanceof Error ? err.message : String(err);
          if (
            message.includes("duplicate key") ||
            message.includes("trips_slug_key")
          ) {
            return await createTrip(supabase, {
              slug: `${baseSlug}-${shortRand()}`,
              name: parsed.data.name,
              description: parsed.data.description ?? null,
              location: parsed.data.location ?? null,
              starts_at: parsed.data.starts_at ?? null,
              ends_at: parsed.data.ends_at ?? null,
              vibe_tags: parsed.data.vibe_tags ?? null,
            });
          }
          throw err;
        }
      }
    );

    // 4. Redirect to the new trip dashboard. Next's `redirect()` throws
    //    NEXT_REDIRECT to short-circuit rendering; tests pin on the
    //    URL via the thrown message.
    redirect(`/trips/${created.slug}`);
  } catch (err) {
    if (err instanceof RateLimitError) {
      return { ok: false, errorKey: "rate_limit" };
    }
    // Re-throw the Next redirect — it's not an error, just control flow.
    if (err instanceof Error && err.message.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    // Also re-throw the Next.js-internal redirect digest (which is not
    // an `Error` instance in some versions). Heuristic: if the thrown
    // value has a `digest` property starting with `NEXT_REDIRECT`,
    // propagate.
    if (
      typeof err === "object" &&
      err !== null &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw err;
    }
    return { ok: false, errorKey: "trip_create_failed" };
  }
}
