/**
 * TDD RED-first tests for AddressAutocomplete component.
 *
 * Covers:
 *   1. Renders debounced input; after 300ms fires fetch.
 *   2. Suggestion list renders on 2xx proxy response.
 *   3. Click suggestion → onChange(address, placeId, 'google').
 *   4. Freeform fallback: blur without selecting → onChange(address, undefined, undefined).
 *   5. Proxy 5xx → error toast address_lookup_failed; UI stays freeform.
 *   6. Injection vectors (Phase 4 Coverage H1):
 *      - CRLF in query: rejected client-side before POST.
 *      - NUL in query: rejected client-side before POST.
 *      - Oversized query (>200 chars): rejected client-side.
 *      - sessionToken is UUID format.
 *   7. Rate-limit 429 → error toast rate_limit.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  act,
} from "@testing-library/react";
import { AddressAutocomplete, isQuerySafe } from "../address-autocomplete";
import { ERRORS } from "@/lib/copy/errors";

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: false });
  global.fetch = mockFetch;
  mockFetch.mockReset();
  vi.clearAllTimers();
});

afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSuggestion(placeId: string, text: string) {
  return {
    placePrediction: {
      placeId,
      text: { text },
    },
  };
}

function makeSuccessResponse(suggestions: ReturnType<typeof makeSuggestion>[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ suggestions }),
  } as unknown as Response;
}

function makeErrorResponse(status: number) {
  return {
    ok: false,
    status,
    json: async () => ({
      errorKey: status === 429 ? "rate_limit" : "places_proxy_failed",
    }),
  } as unknown as Response;
}

/** Advance timers past debounce AND flush all pending microtasks/promises. */
async function flushDebounce() {
  await act(async () => {
    vi.advanceTimersByTime(310);
    // Flush microtasks (resolved promises from mockFetch)
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("AddressAutocomplete", () => {
  const baseProps = {
    address: "",
    addressPlaceId: undefined as string | undefined,
    disabled: false,
  };

  // -------------------------------------------------------------------------
  // 1. Basic render
  // -------------------------------------------------------------------------

  it("renders a text input", () => {
    render(<AddressAutocomplete {...baseProps} onChange={vi.fn()} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("disables the input when disabled=true", () => {
    render(<AddressAutocomplete {...baseProps} onChange={vi.fn()} disabled={true} />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  // -------------------------------------------------------------------------
  // 2. Debounced fetch
  // -------------------------------------------------------------------------

  it("does NOT fetch immediately on keystroke — waits for debounce", async () => {
    mockFetch.mockResolvedValue(makeSuccessResponse([]));
    render(<AddressAutocomplete {...baseProps} onChange={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Las Vegas" } });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fires POST to /api/places/autocomplete after ~300ms debounce", async () => {
    mockFetch.mockResolvedValue(makeSuccessResponse([]));
    render(<AddressAutocomplete {...baseProps} onChange={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Las Vegas" } });
    await flushDebounce();

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/places/autocomplete");
    expect(options.method).toBe("POST");
    const body = JSON.parse(options.body as string) as { query: string };
    expect(body.query).toBe("Las Vegas");
  });

  it("includes a UUID sessionToken in the POST body", async () => {
    mockFetch.mockResolvedValue(makeSuccessResponse([]));
    render(<AddressAutocomplete {...baseProps} onChange={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Chicago" } });
    await flushDebounce();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string) as {
      sessionToken: string;
    };
    expect(body.sessionToken).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("reuses the same sessionToken across multiple keystrokes in a session", async () => {
    mockFetch.mockResolvedValue(makeSuccessResponse([]));
    render(<AddressAutocomplete {...baseProps} onChange={vi.fn()} />);
    const input = screen.getByRole("textbox");

    fireEvent.change(input, { target: { value: "Chi" } });
    await flushDebounce();
    const token1 = JSON.parse(mockFetch.mock.calls[0][1].body as string).sessionToken as string;

    fireEvent.change(input, { target: { value: "Chicago" } });
    await flushDebounce();
    const token2 = JSON.parse(mockFetch.mock.calls[1][1].body as string).sessionToken as string;

    expect(token1).toBe(token2);
  });

  // -------------------------------------------------------------------------
  // 3. Suggestion list renders on 2xx
  // -------------------------------------------------------------------------

  it("renders suggestion list items when proxy returns results", async () => {
    mockFetch.mockResolvedValue(
      makeSuccessResponse([
        makeSuggestion("place-1", "Las Vegas, NV, USA"),
        makeSuggestion("place-2", "Las Vegas, NM, USA"),
      ])
    );
    render(<AddressAutocomplete {...baseProps} onChange={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Las Vegas" } });
    await flushDebounce();

    expect(screen.getByText("Las Vegas, NV, USA")).toBeInTheDocument();
    expect(screen.getByText("Las Vegas, NM, USA")).toBeInTheDocument();
  });

  it("renders at most 5 suggestions", async () => {
    const manySuggestions = Array.from({ length: 8 }, (_, i) =>
      makeSuggestion(`place-${i}`, `Place ${i}`)
    );
    mockFetch.mockResolvedValue(makeSuccessResponse(manySuggestions));
    render(<AddressAutocomplete {...baseProps} onChange={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "test" } });
    await flushDebounce();

    const items = screen.getAllByRole("option");
    expect(items.length).toBeLessThanOrEqual(5);
  });

  // -------------------------------------------------------------------------
  // 4. Click suggestion → onChange(address, placeId, 'google')
  // -------------------------------------------------------------------------

  it("calls onChange with address, placeId, 'google' when suggestion is clicked", async () => {
    mockFetch.mockResolvedValue(
      makeSuccessResponse([makeSuggestion("place-abc", "123 Main St, Las Vegas, NV")])
    );
    const onChange = vi.fn();
    render(<AddressAutocomplete {...baseProps} onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "123 Main" } });
    await flushDebounce();

    expect(screen.getByText("123 Main St, Las Vegas, NV")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText("123 Main St, Las Vegas, NV"));

    expect(onChange).toHaveBeenCalledWith(
      "123 Main St, Las Vegas, NV",
      "place-abc",
      "google"
    );
  });

  it("hides suggestion list after a selection", async () => {
    mockFetch.mockResolvedValue(
      makeSuccessResponse([makeSuggestion("place-abc", "123 Main St")])
    );
    render(<AddressAutocomplete {...baseProps} onChange={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "123" } });
    await flushDebounce();

    expect(screen.getByText("123 Main St")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByText("123 Main St"));

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 5. Freeform fallback: blur without selecting → onChange(address, undefined, undefined)
  // -------------------------------------------------------------------------

  it("calls onChange with (address, undefined, undefined) on blur without selection", async () => {
    const onChange = vi.fn();
    render(<AddressAutocomplete {...baseProps} onChange={onChange} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "Some typed address" } });

    // Blur without clicking a suggestion
    fireEvent.blur(input);
    // Advance past the 150ms blur delay
    await act(async () => {
      vi.advanceTimersByTime(200);
      await Promise.resolve();
    });

    expect(onChange).toHaveBeenCalledWith("Some typed address", undefined, undefined);
  });

  // -------------------------------------------------------------------------
  // 6. Proxy 5xx → error toast address_lookup_failed
  // -------------------------------------------------------------------------

  it("shows address_lookup_failed error message on proxy 5xx and remains freeform", async () => {
    mockFetch.mockResolvedValue(makeErrorResponse(502));
    render(<AddressAutocomplete {...baseProps} onChange={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "some query" } });
    await flushDebounce();

    expect(screen.getByText(ERRORS.address_lookup_failed)).toBeInTheDocument();
    // Input should still be functional (freeform fallback)
    expect(screen.getByRole("textbox")).not.toBeDisabled();
  });

  it("shows address_lookup_failed when fetch throws (network error)", async () => {
    mockFetch.mockRejectedValue(new Error("Network down"));
    render(<AddressAutocomplete {...baseProps} onChange={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "query" } });
    await flushDebounce();

    expect(screen.getByText(ERRORS.address_lookup_failed)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 7. Injection vectors (Phase 4 Coverage H1)
  //
  // Note on browser reality: <input type="text"> strips CR and LF from values
  // natively (both in browsers and jsdom), so these chars cannot reach the
  // component's onChange handler via normal user input. NUL is similarly
  // stripped. The client-side guard (`isQuerySafe`) is defense-in-depth
  // for programmatic consumers. We test both the exported guard directly and
  // the component's behavior with values that bypass input sanitization.
  // -------------------------------------------------------------------------

  it("exported isQuerySafe rejects CR", () => {
    expect(isQuerySafe("Las\rVegas")).toBe(false);
  });

  it("exported isQuerySafe rejects LF", () => {
    expect(isQuerySafe("Las\nVegas")).toBe(false);
  });

  it("exported isQuerySafe rejects CRLF sequence", () => {
    expect(isQuerySafe("foo\r\nbar")).toBe(false);
  });

  it("exported isQuerySafe rejects NUL character", () => {
    expect(isQuerySafe("Las\0Vegas")).toBe(false);
  });

  it("exported isQuerySafe rejects query over 200 chars", () => {
    expect(isQuerySafe("a".repeat(201))).toBe(false);
  });

  it("exported isQuerySafe accepts a normal query", () => {
    expect(isQuerySafe("Las Vegas, NV")).toBe(true);
  });

  it("rejects query over 200 chars in component — does NOT call fetch", async () => {
    render(<AddressAutocomplete {...baseProps} onChange={vi.fn()} />);
    const longQuery = "a".repeat(201);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: longQuery } });
    await flushDebounce();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 8. Rate-limit 429 → error toast rate_limit
  // -------------------------------------------------------------------------

  it("shows rate_limit error message on 429 response", async () => {
    mockFetch.mockResolvedValue(makeErrorResponse(429));
    render(<AddressAutocomplete {...baseProps} onChange={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "search" } });
    await flushDebounce();

    expect(screen.getByText(ERRORS.rate_limit)).toBeInTheDocument();
  });
});
