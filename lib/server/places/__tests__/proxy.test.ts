/**
 * Unit tests for `lib/server/places/proxy.ts` — the pure-function core of
 * the Google Places Autocomplete server-side proxy (W0c, M4, #166).
 *
 * Tests are against the extracted helper, not the route handler, per
 * Override C in the scope spec (tests under lib/ only).
 *
 * External dependencies mocked:
 *  - global `fetch` (via vi.stubGlobal / vi.fn)
 *  - process.env.GOOGLE_PLACES_API_KEY
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchPlacesAutocomplete,
  validatePlacesInput,
  type PlacesAutocompleteInput,
  type PlacesProxyResult,
} from "@/lib/server/places/proxy";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetchOk(body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => body,
  } as Response);
}

function makeFetchError(status: number): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({}),
  } as Response);
}

const VALID_INPUT: PlacesAutocompleteInput = {
  query: "Nashville airport",
  sessionToken: "550e8400-e29b-41d4-a716-446655440000",
};

const MOCK_SUGGESTIONS = {
  suggestions: [
    { placePrediction: { placeId: "ChIJxxx", text: { text: "Nashville" } } },
  ],
};

// ---------------------------------------------------------------------------
// validatePlacesInput
// ---------------------------------------------------------------------------

describe("validatePlacesInput", () => {
  it("accepts a valid query with optional sessionToken", () => {
    const result = validatePlacesInput({ query: "Vegas strip" });
    expect(result.ok).toBe(true);
  });

  it("accepts a valid query with a UUID sessionToken", () => {
    const result = validatePlacesInput(VALID_INPUT);
    expect(result.ok).toBe(true);
  });

  it("rejects an empty query", () => {
    const result = validatePlacesInput({ query: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorKey).toBe("validation_failed");
  });

  it("rejects a query that exceeds 200 chars", () => {
    const result = validatePlacesInput({ query: "a".repeat(201) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorKey).toBe("validation_failed");
  });

  it("accepts a query of exactly 200 chars", () => {
    const result = validatePlacesInput({ query: "a".repeat(200) });
    expect(result.ok).toBe(true);
  });

  it("rejects a query containing a NUL character (\\0)", () => {
    const result = validatePlacesInput({ query: "hello\0world" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorKey).toBe("validation_failed");
  });

  it("rejects a query containing a carriage return (\\r)", () => {
    const result = validatePlacesInput({ query: "hello\rworld" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorKey).toBe("validation_failed");
  });

  it("rejects a query containing a newline (\\n)", () => {
    const result = validatePlacesInput({ query: "hello\nworld" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorKey).toBe("validation_failed");
  });

  it("trims whitespace before checking length", () => {
    // A query that is only spaces trims to empty → invalid.
    const result = validatePlacesInput({ query: "   " });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorKey).toBe("validation_failed");
  });

  it("rejects a non-UUID sessionToken", () => {
    const result = validatePlacesInput({ query: "airport", sessionToken: "not-a-uuid" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorKey).toBe("validation_failed");
  });

  it("accepts sessionToken undefined (optional field)", () => {
    const result = validatePlacesInput({ query: "airport" });
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fetchPlacesAutocomplete
// ---------------------------------------------------------------------------

describe("fetchPlacesAutocomplete", () => {
  const SAVED_KEY = process.env.GOOGLE_PLACES_API_KEY;

  beforeEach(() => {
    process.env.GOOGLE_PLACES_API_KEY = "test-api-key";
    vi.stubGlobal("fetch", makeFetchOk(MOCK_SUGGESTIONS));
  });

  afterEach(() => {
    if (SAVED_KEY === undefined) delete process.env.GOOGLE_PLACES_API_KEY;
    else process.env.GOOGLE_PLACES_API_KEY = SAVED_KEY;
    vi.unstubAllGlobals();
  });

  it("calls the Google Places Autocomplete API with correct URL", async () => {
    const result = await fetchPlacesAutocomplete(VALID_INPUT);
    expect(result.ok).toBe(true);

    expect(fetch).toHaveBeenCalledOnce();
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://places.googleapis.com/v1/places:autocomplete");
  });

  it("sets the X-Goog-Api-Key header from env var", async () => {
    await fetchPlacesAutocomplete(VALID_INPUT);

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe("test-api-key");
  });

  it("sets Content-Type application/json", async () => {
    await fetchPlacesAutocomplete(VALID_INPUT);

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("POSTs the query and sessionToken in the request body", async () => {
    await fetchPlacesAutocomplete(VALID_INPUT);

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.input).toBe(VALID_INPUT.query);
    expect(body.sessionToken).toBe(VALID_INPUT.sessionToken);
  });

  it("omits sessionToken from body when not provided", async () => {
    await fetchPlacesAutocomplete({ query: "airport" });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.sessionToken).toBeUndefined();
  });

  it("returns ok:true with suggestions on a 200 upstream response", async () => {
    const result = await fetchPlacesAutocomplete(VALID_INPUT);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.suggestions).toEqual(MOCK_SUGGESTIONS.suggestions);
    }
  });

  it("returns ok:false with errorKey:'places_proxy_failed' on upstream non-2xx", async () => {
    vi.stubGlobal("fetch", makeFetchError(503));

    const result = await fetchPlacesAutocomplete(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorKey).toBe("places_proxy_failed");
  });

  it("returns ok:false with errorKey:'places_proxy_failed' when fetch throws (network error)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network failure")));

    const result = await fetchPlacesAutocomplete(VALID_INPUT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errorKey).toBe("places_proxy_failed");
  });

  it("does NOT echo query in the error result (injection safety)", async () => {
    vi.stubGlobal("fetch", makeFetchError(403));

    const evilQuery = "'; DROP TABLE trips; --";
    const result = await fetchPlacesAutocomplete({ query: evilQuery });
    expect(result.ok).toBe(false);
    // The errorKey must never contain user-supplied data.
    if (!result.ok) {
      expect(result.errorKey).not.toContain(evilQuery);
    }
  });

  it("console.errors the upstream status on failure (not the body)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", makeFetchError(403));

    await fetchPlacesAutocomplete(VALID_INPUT);

    // Must log the status code.
    expect(spy).toHaveBeenCalled();
    const loggedArgs = spy.mock.calls[0]?.join(" ") ?? "";
    expect(loggedArgs).toContain("403");

    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// PlacesProxyResult type shape (compile-time verification via assignability)
// ---------------------------------------------------------------------------

describe("PlacesProxyResult discriminated union", () => {
  it("ok:true carries suggestions array", () => {
    const result: PlacesProxyResult = {
      ok: true,
      suggestions: [],
    };
    expect(result.ok).toBe(true);
  });

  it("ok:false carries errorKey string", () => {
    const result: PlacesProxyResult = {
      ok: false,
      errorKey: "places_proxy_failed",
    };
    expect(result.ok).toBe(false);
  });
});
