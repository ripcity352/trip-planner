"use client";

/**
 * AddressAutocomplete — replaces the freeform address input with a
 * Places-API-backed suggestion picker (W2a, M4, #166).
 *
 * Design decisions:
 *  - Calls only /api/places/autocomplete (never Google directly).
 *  - Generates one UUID sessionToken per autocomplete session; reuses it
 *    until the user selects a suggestion or dismisses the list.
 *  - Validates query client-side (CRLF/NUL/length) before POST — mirrors
 *    server-side validation as defense-in-depth (Phase 4 Coverage H1).
 *  - Freeform fallback: typing then blurring without selecting emits
 *    (address, undefined, undefined) so the form can persist address-only.
 *  - No new npm dependencies — debounce via setTimeout, UUID via
 *    crypto.randomUUID().
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS } from "@/lib/copy/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PlacesSuggestion {
  placePrediction?: {
    placeId?: string;
    text?: { text?: string };
  };
}

export interface AddressAutocompleteProps {
  address: string;
  addressPlaceId?: string;
  onChange: (
    address: string,
    placeId: string | undefined,
    provider: "google" | undefined
  ) => void;
  disabled: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEBOUNCE_MS = 300;
const MAX_SUGGESTIONS = 5;
const MAX_QUERY_LENGTH = 200;

// ---------------------------------------------------------------------------
// Validation (exported for unit tests — Phase 4 Coverage H1)
// ---------------------------------------------------------------------------

/** NUL, CR, LF — mirrors server-side CONTROL_CHAR_RE in proxy.ts. */
const CONTROL_CHAR_RE = /[\0\r\n]/;

/**
 * Client-side query safety check. Returns false if the query contains
 * control characters (CRLF/NUL injection vectors) or exceeds the max length.
 * Defense-in-depth — the server validates identically; this prevents wasted
 * round-trips and provides injection resistance for programmatic callers.
 */
export function isQuerySafe(query: string): boolean {
  if (query.length > MAX_QUERY_LENGTH) return false;
  if (CONTROL_CHAR_RE.test(query)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Shared styles (mirrors address-field.tsx)
// ---------------------------------------------------------------------------

const inputClass = cn(
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm",
  "placeholder:text-muted-foreground",
  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
  "disabled:cursor-not-allowed disabled:opacity-60",
  // Persimmon focus-ring + ≥44px tap target
  "min-h-[44px]"
);

const labelClass = "block text-sm font-medium text-foreground mb-1";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AddressAutocomplete({
  address,
  onChange,
  disabled,
}: AddressAutocompleteProps) {
  // Derived state: track previous address prop to detect external resets.
  // Using React's recommended getDerivedStateFromProps pattern (via state pair).
  const [prevAddressProp, setPrevAddressProp] = React.useState(address);
  const [inputValue, setInputValue] = React.useState(address);
  const [suggestions, setSuggestions] = React.useState<PlacesSuggestion[]>([]);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = React.useState(false);

  // One sessionToken per autocomplete session — reset on selection/dismiss.
  const sessionTokenRef = React.useRef<string>(crypto.randomUUID());
  const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  // Flag: a suggestion mouseDown fired; blur handler should not emit freeform.
  const selectingRef = React.useRef(false);

  // Sync external address prop changes (e.g. parent form reset).
  // This is the React-recommended getDerivedStateFromProps equivalent.
  if (prevAddressProp !== address) {
    setPrevAddressProp(address);
    setInputValue(address);
  }

  // -------------------------------------------------------------------------
  // Input validation (client-side guard — mirrors server schema)
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // Fetch suggestions
  // -------------------------------------------------------------------------

  async function fetchSuggestions(query: string): Promise<void> {
    setErrorMessage(null);
    try {
      const response = await fetch("/api/places/autocomplete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          sessionToken: sessionTokenRef.current,
        }),
      });

      if (response.status === 429) {
        setErrorMessage(ERRORS.rate_limit);
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      if (!response.ok) {
        setErrorMessage(ERRORS.address_lookup_failed);
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      const data = (await response.json()) as { suggestions?: PlacesSuggestion[] };
      const list = (data.suggestions ?? []).slice(0, MAX_SUGGESTIONS);
      setSuggestions(list);
      setShowSuggestions(list.length > 0);
    } catch {
      setErrorMessage(ERRORS.address_lookup_failed);
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }

  // -------------------------------------------------------------------------
  // Event handlers
  // -------------------------------------------------------------------------

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setInputValue(value);
    setErrorMessage(null);

    // Clear any in-flight debounce
    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }

    // Skip fetch if query fails client-side validation
    if (!value.trim() || !isQuerySafe(value)) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceTimerRef.current = setTimeout(() => {
      void fetchSuggestions(value);
    }, DEBOUNCE_MS);
  }

  function handleBlur() {
    // Small delay so mouseDown on suggestion fires before blur dismisses the list.
    // mouseDown fires before blur, so onMouseDown on <li> items sets a flag.
    setTimeout(() => {
      if (!selectingRef.current) {
        setShowSuggestions(false);
        // Freeform fallback: no selection made → emit without placeId/provider.
        onChange(inputValue, undefined, undefined);
      }
      selectingRef.current = false;
    }, 0);
  }

  function handleSuggestionMouseDown(suggestion: PlacesSuggestion) {
    // Set flag BEFORE blur fires (mouseDown fires before blur).
    selectingRef.current = true;

    const text = suggestion.placePrediction?.text?.text ?? "";
    const placeId = suggestion.placePrediction?.placeId;

    setInputValue(text);
    setSuggestions([]);
    setShowSuggestions(false);

    // Reset session token after a completed selection.
    sessionTokenRef.current = crypto.randomUUID();

    onChange(text, placeId, "google");
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="relative">
      <label htmlFor="edit-address" className={labelClass}>
        {M3_UI_STRINGS.itineraryForm_address_label}
      </label>
      <input
        id="edit-address"
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        placeholder={M3_UI_STRINGS.itineraryForm_address_placeholder}
        disabled={disabled}
        className={inputClass}
        autoComplete="off"
        aria-autocomplete="list"
        aria-haspopup="listbox"
      />

      {/* Error message */}
      {errorMessage !== null ? (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "mt-1 text-xs")}>
          {errorMessage}
        </p>
      ) : null}

      {/* Suggestion list */}
      {showSuggestions && suggestions.length > 0 ? (
        <ul
          role="listbox"
          className={cn(
            "absolute left-0 right-0 z-50 mt-1 overflow-hidden",
            "rounded-md border border-border bg-background shadow-md"
          )}
        >
          {suggestions.map((suggestion, idx) => {
            const text = suggestion.placePrediction?.text?.text ?? "";
            return (
              <li
                key={idx}
                role="option"
                aria-selected={false}
                onMouseDown={() => handleSuggestionMouseDown(suggestion)}
                className={cn(
                  "cursor-pointer px-3 py-2 text-sm",
                  "hover:bg-muted focus:bg-muted",
                  "min-h-[44px] flex items-center"
                )}
              >
                {text}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
