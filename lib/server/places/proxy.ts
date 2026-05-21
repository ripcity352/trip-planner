/**
 * Pure-function core for the Google Places Autocomplete server-side proxy
 * (W0c, M4, issue #166).
 *
 * Extracted from the route handler so it can be unit-tested without spinning
 * up Next.js (Override C: tests under lib/ only).
 *
 * Constraints:
 *  - No new npm packages — uses built-in `fetch`.
 *  - Service-role key NOT used. Reads GOOGLE_PLACES_API_KEY only.
 *  - Never echoes user input in error responses.
 *  - console.error logs upstream status code on failure (NOT body — body may
 *    echo user-supplied query back and expose it in logs).
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Validated, sanitised input accepted by the proxy. */
export interface PlacesAutocompleteInput {
  query: string;
  sessionToken?: string;
}

/** A single suggestion from the Places Autocomplete API v1. */
export interface PlacesSuggestion {
  placePrediction?: {
    placeId?: string;
    text?: { text?: string };
  };
}

export type PlacesProxyResult =
  | { ok: true; suggestions: PlacesSuggestion[] }
  | { ok: false; errorKey: "validation_failed" | "places_proxy_failed" };

type ValidationResult =
  | { ok: true; query: string; sessionToken?: string }
  | { ok: false; errorKey: "validation_failed" };

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Control-character blocklist: NUL, CR, LF — any of these in a query string
 * indicates a CRLF-injection attempt and must be rejected before the input
 * reaches the upstream API.
 */
const CONTROL_CHAR_RE = /[\0\r\n]/;

const PlacesInputSchema = z.object({
  query: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine((v) => !CONTROL_CHAR_RE.test(v), {
      message: "query must not contain control characters",
    }),
  sessionToken: z.string().uuid().optional(),
});

/**
 * Validates raw caller-supplied input. Returns a discriminated union so the
 * route handler can pattern-match cleanly without try/catch.
 */
export function validatePlacesInput(raw: unknown): ValidationResult {
  const parsed = PlacesInputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errorKey: "validation_failed" };
  }
  return {
    ok: true,
    query: parsed.data.query,
    sessionToken: parsed.data.sessionToken,
  };
}

// ---------------------------------------------------------------------------
// Proxy
// ---------------------------------------------------------------------------

const PLACES_AUTOCOMPLETE_URL =
  "https://places.googleapis.com/v1/places:autocomplete";

/**
 * Fetches autocomplete suggestions from the Google Places API (New) v1.
 *
 * Returns `ok: false` with `errorKey: "places_proxy_failed"` on any
 * network or upstream error. The upstream response body is never echoed in
 * the error result (body may contain a reflection of user input).
 */
export async function fetchPlacesAutocomplete(
  input: PlacesAutocompleteInput,
): Promise<PlacesProxyResult> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;

  const requestBody: Record<string, string> = { input: input.query };
  if (input.sessionToken !== undefined) {
    requestBody.sessionToken = input.sessionToken;
  }

  let response: Response;
  try {
    response = await fetch(PLACES_AUTOCOMPLETE_URL, {
      method: "POST",
      headers: {
        "X-Goog-Api-Key": apiKey ?? "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    // Network-level failure (DNS, TCP timeout, etc.)
    console.error(
      "[places-proxy] fetch threw — upstream unreachable:",
      err instanceof Error ? err.message : String(err),
    );
    return { ok: false, errorKey: "places_proxy_failed" };
  }

  if (!response.ok) {
    // Log status only — NOT the body (body may echo the user query).
    console.error(
      `[places-proxy] upstream returned non-2xx status: ${response.status}`,
    );
    return { ok: false, errorKey: "places_proxy_failed" };
  }

  const data = (await response.json()) as { suggestions?: PlacesSuggestion[] };
  return {
    ok: true,
    suggestions: data.suggestions ?? [],
  };
}
