"use client";

/**
 * AirlinePicker — typeahead airline selector with freeform fallback.
 *
 * - Filters the top-50 IATA catalog by IATA code OR name substring
 *   (case-insensitive).
 * - On known-airline selection: sets `airlineIata`, clears `carrier`.
 * - On freeform selection ("Type your airline"): sets `carrier`,
 *   clears `airlineIata`.
 * - Flight number input enforces `^[A-Z0-9]{1,8}$`, auto-uppercases,
 *   is optional.
 * - NUL and CRLF are stripped from freeform carrier before onChange.
 * - Persimmon focus-ring, ≥44px tap targets, mobile-first.
 * - No new npm deps.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { AIRLINES } from "@/lib/data/airlines";
import { M4_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS } from "@/lib/copy/errors";

// ─── types ────────────────────────────────────────────────────────────────────

export interface AirlinePickerValue {
  airlineIata?: string;
  flightNumber?: string;
  carrier?: string;
}

export interface AirlinePickerProps {
  value: AirlinePickerValue;
  onChange: (next: AirlinePickerValue) => void;
  disabled?: boolean;
}

// ─── constants ────────────────────────────────────────────────────────────────

const FLIGHT_NUMBER_REGEX = /^[A-Z0-9]{1,8}$/;
// Strip NUL bytes, carriage returns, and line feeds from freeform text
const CARRIER_SANITIZE_REGEX = /[\0\r\n]/g;

// ─── utils ────────────────────────────────────────────────────────────────────

function resolveDisplayValue(
  query: string,
  airlineIata: string | undefined
): string {
  if (airlineIata) {
    const match = AIRLINES.find((a) => a.iata === airlineIata);
    if (match) return `${match.iata} / ${match.name}`;
  }
  return query;
}

function filterAirlines(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return AIRLINES.filter(
    (a) =>
      a.iata.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q)
  );
}

function sanitizeCarrier(raw: string): string {
  return raw.replace(CARRIER_SANITIZE_REGEX, "");
}

// ─── component ────────────────────────────────────────────────────────────────

export function AirlinePicker({
  value,
  onChange,
  disabled = false,
}: AirlinePickerProps) {
  const { airlineIata, flightNumber, carrier } = value;

  // Internal query state — what the user is currently typing in the combobox.
  // When an airline is selected, we set query to the display string and
  // close the listbox. When cleared, query resets to "".
  const [query, setQuery] = React.useState<string>(() => {
    if (airlineIata) {
      const match = AIRLINES.find((a) => a.iata === airlineIata);
      if (match) return `${match.iata} / ${match.name}`;
    }
    return carrier ?? "";
  });
  const [open, setOpen] = React.useState(false);
  const [flightNumberError, setFlightNumberError] = React.useState<
    string | null
  >(null);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const listboxId = React.useId();

  const suggestions = filterAirlines(query);
  const hasSuggestions = suggestions.length > 0;
  const hasQuery = query.trim().length > 0;
  // Show freeform option when there's a non-empty query that doesn't fully
  // match any airline and we're not showing a selected airline.
  // Per code-review H2: also gate on !hasSuggestions so the "Type your
  // airline" row doesn't render when an exact IATA already matches.
  const showFreeform = hasQuery && !airlineIata && !hasSuggestions;

  // ── handlers ──────────────────────────────────────────────────────────────

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setQuery(next);
    // Any manual typing deselects the previously-picked known airline
    if (airlineIata) {
      onChange({ ...value, airlineIata: undefined });
    }
    setOpen(true);
  };

  const handleSelectAirline = (iata: string) => {
    const airline = AIRLINES.find((a) => a.iata === iata);
    if (!airline) return;
    const display = `${airline.iata} / ${airline.name}`;
    setQuery(display);
    setOpen(false);
    onChange({ ...value, airlineIata: iata, carrier: undefined });
  };

  const handleSelectFreeform = () => {
    const sanitized = sanitizeCarrier(query);
    setOpen(false);
    onChange({ ...value, carrier: sanitized, airlineIata: undefined });
  };

  const handleClear = () => {
    setQuery("");
    setOpen(false);
    onChange({ ...value, airlineIata: undefined, carrier: undefined });
    inputRef.current?.focus();
  };

  const handleFlightNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    setFlightNumberError(null);
    if (raw.length > 8) return;
    onChange({ ...value, flightNumber: raw || undefined });
  };

  const handleBlur = () => {
    // Small delay so click-on-option fires before we close
    setTimeout(() => setOpen(false), 150);
  };

  // ── classes ───────────────────────────────────────────────────────────────

  const inputClass = cn(
    "w-full rounded-xs border border-border bg-background px-3 py-2 text-sm",
    "placeholder:text-muted-foreground",
    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
    "disabled:cursor-not-allowed disabled:opacity-60",
    "min-h-[44px]"
  );

  const labelClass = "block text-sm font-medium text-foreground mb-1";

  // Sync external airlineIata changes (e.g. pre-populated edit mode) back
  // into the internal query display when the component initialises.
  const displayValue = airlineIata
    ? resolveDisplayValue(query, airlineIata)
    : query;

  // Validate flightNumber from external value prop (for error display)
  const externalFlightNumberInvalid =
    flightNumber !== undefined &&
    flightNumber !== "" &&
    !FLIGHT_NUMBER_REGEX.test(flightNumber);

  return (
    <div className="flex flex-col gap-4">
      {/* Airline typeahead */}
      <div className="relative">
        <label
          htmlFor="airline-picker-input"
          className={labelClass}
        >
          Airline
        </label>

        <div className="relative flex items-center">
          <input
            ref={inputRef}
            id="airline-picker-input"
            role="combobox"
            aria-label="Airline"
            aria-autocomplete="list"
            aria-expanded={open && (hasSuggestions || showFreeform)}
            aria-controls={listboxId}
            type="text"
            value={displayValue}
            onChange={handleInputChange}
            onFocus={() => {
              if (query.trim()) setOpen(true);
            }}
            onBlur={handleBlur}
            disabled={disabled}
            placeholder={M4_UI_STRINGS.travelLeg_airline_placeholder}
            autoComplete="off"
            className={cn(inputClass, airlineIata ? "pr-10" : "")}
          />

          {/* Clear button — only shown when an airline is selected */}
          {airlineIata ? (
            <button
              type="button"
              aria-label="Clear airline"
              onClick={handleClear}
              disabled={disabled}
              className={cn(
                "absolute right-2 flex h-6 w-6 items-center justify-center rounded-xs",
                "text-muted-foreground hover:text-foreground",
                "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                "disabled:cursor-not-allowed disabled:opacity-60"
              )}
            >
              {/* × */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          ) : null}
        </div>

        {/* Suggestion listbox */}
        {open && (hasSuggestions || showFreeform) ? (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Airline suggestions"
            className={cn(
              "absolute z-50 mt-1 w-full rounded-md border border-border bg-background shadow-md",
              "max-h-60 overflow-y-auto"
            )}
          >
            {suggestions.map((airline) => (
              <li
                key={airline.iata}
                role="option"
                aria-selected={airline.iata === airlineIata}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent blur before click registers
                  handleSelectAirline(airline.iata);
                }}
                className={cn(
                  "min-h-[44px] cursor-pointer px-3 py-2 text-sm",
                  "flex items-center gap-2",
                  "hover:bg-muted focus:bg-muted",
                  airline.iata === airlineIata && "bg-muted font-medium"
                )}
              >
                <span className="font-mono text-xs text-muted-foreground w-6">
                  {airline.iata}
                </span>
                <span>
                  {airline.iata} / {airline.name}
                </span>
              </li>
            ))}

            {/* Freeform fallback option */}
            {showFreeform ? (
              <li
                role="option"
                aria-selected={false}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelectFreeform();
                }}
                className={cn(
                  "min-h-[44px] cursor-pointer border-t border-border px-3 py-2 text-sm",
                  "flex items-center text-muted-foreground italic",
                  "hover:bg-muted"
                )}
              >
                {M4_UI_STRINGS.travelLeg_airline_placeholder}
              </li>
            ) : null}
          </ul>
        ) : null}

        {/* Freeform fallback when no known airline matches and listbox is closed */}
        {!open && showFreeform && !hasSuggestions ? (
          <p
            className="mt-1 text-xs text-muted-foreground italic cursor-pointer"
            onMouseDown={(e) => {
              e.preventDefault();
              handleSelectFreeform();
            }}
          >
            {M4_UI_STRINGS.travelLeg_airline_placeholder}
          </p>
        ) : null}
      </div>

      {/* Flight number */}
      <div>
        <label htmlFor="flight-number-input" className={labelClass}>
          Flight number
        </label>
        <input
          id="flight-number-input"
          aria-label="Flight number"
          type="text"
          value={flightNumber ?? ""}
          onChange={handleFlightNumberChange}
          disabled={disabled}
          placeholder="e.g. 1234"
          maxLength={8}
          className={inputClass}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
        />
        {(flightNumberError || externalFlightNumberInvalid) ? (
          <p role="alert" className={cn(ERROR_LINE_CLASS, "mt-1 text-xs")}>
            {ERRORS.validation_failed}
          </p>
        ) : null}
      </div>
    </div>
  );
}
