/**
 * `POST /api/places/autocomplete` — server-side proxy to Google Places
 * Autocomplete API (W0c, M4, issue #166).
 *
 * This handler is intentionally thin: it enforces auth + rate-limiting, then
 * delegates to `lib/server/places/proxy.ts` for the actual upstream call.
 * All pure logic lives in that module so it can be unit-tested without the
 * Next.js Route Handler runtime (Override C: tests under lib/ only).
 *
 * Security posture:
 *  - Auth-gated: anonymous callers receive 401.
 *  - Rate-limited (fail-CLOSED on shim): PLACES_AUTOCOMPLETE scope, keyed by
 *    user id. Returns 429 if denied.
 *  - Validates input with Zod (via proxy helper) before any outbound fetch.
 *  - Never echoes user input in error responses.
 *  - GOOGLE_PLACES_API_KEY is server-only; not prefixed with NEXT_PUBLIC_.
 */

import { type NextRequest, NextResponse } from "next/server";

import {
  RATE_LIMIT_SCOPES,
  RateLimitError,
  rateLimitedAction,
} from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import {
  fetchPlacesAutocomplete,
  validatePlacesInput,
} from "@/lib/server/places/proxy";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // --- 1. Auth ---
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return NextResponse.json({ errorKey: "auth_failed" }, { status: 401 });
  }
  const userId = authData.user.id;

  // --- 2. Parse + validate body ---
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errorKey: "validation_failed" }, { status: 400 });
  }

  const validation = validatePlacesInput(body);
  if (!validation.ok) {
    return NextResponse.json({ errorKey: validation.errorKey }, { status: 400 });
  }

  // --- 3. Rate-limit (fail-CLOSED on shim for this scope) ---
  try {
    return await rateLimitedAction(
      RATE_LIMIT_SCOPES.PLACES_AUTOCOMPLETE,
      userId,
      async () => {
        // --- 4. Proxy to Google Places ---
        const result = await fetchPlacesAutocomplete({
          query: validation.query,
          sessionToken: validation.sessionToken,
        });

        if (!result.ok) {
          return NextResponse.json(
            { errorKey: result.errorKey },
            { status: 502 },
          );
        }

        return NextResponse.json({ suggestions: result.suggestions });
      },
    );
  } catch (err) {
    if (err instanceof RateLimitError) {
      return NextResponse.json({ errorKey: "rate_limit" }, { status: 429 });
    }
    throw err;
  }
}
