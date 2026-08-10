"use client";

/**
 * AirportPicker — single-field typeahead airport selector with freeform fallback.
 *
 * - Filters the airport catalog by IATA code, name, or city substring
 *   (case-insensitive).
 * - On known-airport selection: `onChange` receives the uppercase IATA code.
 * - On freeform selection: `onChange` receives the sanitized typed text.
 * - Typing always calls `onChange` with the raw typed text (mirrors
 *   AirlinePicker's clear-on-type behavior), so the value never freezes on
 *   a stale selection.
 * - NUL and CRLF are stripped from freeform text before onChange.
 * - Persimmon focus-ring, ≥44px tap targets, mobile-first.
 * - No new npm deps.
 */

import * as React from "react";
import { cn } from "@/lib/utils";
import { AIRPORTS } from "@/lib/data/airports";
import { M4_UI_STRINGS } from "@/lib/copy/empty-states";

export interface AirportPickerProps {
  id: string;
  label: string;
  value: string | undefined;
  onChange: (next: string) => void;
  disabled?: boolean;
}

// Strip NUL bytes, carriage returns, and line feeds from freeform text
const FREEFORM_SANITIZE_REGEX = /[\0\r\n]/g;

function findAirport(iata: string | undefined) {
  if (!iata) return undefined;
  const q = iata.toLowerCase();
  return AIRPORTS.find((a) => a.iata.toLowerCase() === q);
}

function filterAirports(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return AIRPORTS.filter(
    (a) =>
      a.iata.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      a.city.toLowerCase().includes(q)
  );
}

function sanitizeFreeform(raw: string): string {
  return raw.replace(FREEFORM_SANITIZE_REGEX, "");
}

export function AirportPicker({
  id,
  label,
  value,
  onChange,
  disabled = false,
}: AirportPickerProps) {
  const knownAirport = findAirport(value);

  const [query, setQuery] = React.useState<string>(() => {
    if (knownAirport) return `${knownAirport.iata} / ${knownAirport.city}`;
    return value ?? "";
  });
  const [open, setOpen] = React.useState(false);

  const inputRef = React.useRef<HTMLInputElement>(null);
  const listboxId = React.useId();

  const suggestions = filterAirports(query);
  const hasSuggestions = suggestions.length > 0;
  const hasQuery = query.trim().length > 0;
  const showFreeform = hasQuery && !knownAirport && !hasSuggestions;

  const displayValue = knownAirport
    ? `${knownAirport.iata} / ${knownAirport.city}`
    : query;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Sanitize on every keystroke, not just the freeform-select action —
    // otherwise a pasted NUL/CRLF reaches the form on the far more common
    // "type and hit Save" path without ever opening the suggestion row.
    const next = sanitizeFreeform(e.target.value);
    setQuery(next);
    // An exact case-insensitive match to a catalog code resolves the
    // display to "IATA / City" (below) even though the user never
    // explicitly selected a suggestion — commit the canonical uppercase
    // code here too, or the stored value stays whatever case they typed
    // ("pdx") while the UI shows the resolved catalog entry, silently
    // reintroducing the case inconsistency this picker exists to fix.
    const exactMatch = findAirport(next);
    onChange(exactMatch ? exactMatch.iata : next);
    setOpen(true);
  };

  const handleSelectAirport = (iata: string) => {
    const airport = findAirport(iata);
    if (!airport) return;
    setQuery(`${airport.iata} / ${airport.city}`);
    setOpen(false);
    onChange(airport.iata);
  };

  const handleSelectFreeform = () => {
    const sanitized = sanitizeFreeform(query);
    setOpen(false);
    onChange(sanitized);
  };

  const handleClear = () => {
    setQuery("");
    setOpen(false);
    onChange("");
    inputRef.current?.focus();
  };

  const handleBlur = () => {
    setTimeout(() => setOpen(false), 150);
  };

  const inputClass = cn(
    "w-full rounded-xs border border-border bg-background px-3 py-2 text-sm",
    "placeholder:text-muted-foreground",
    "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
    "disabled:cursor-not-allowed disabled:opacity-60",
    "min-h-[44px]"
  );

  const labelClass = "block text-sm font-medium text-foreground mb-1";

  return (
    <div className="relative">
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>

      <div className="relative flex items-center">
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-label={label}
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
          placeholder={M4_UI_STRINGS.travelLeg_airport_placeholder}
          autoComplete="off"
          className={cn(inputClass, knownAirport ? "pr-10" : "")}
        />

        {knownAirport ? (
          <button
            type="button"
            aria-label={`Clear ${label.toLowerCase()}`}
            onClick={handleClear}
            disabled={disabled}
            className={cn(
              "absolute right-2 flex h-6 w-6 items-center justify-center rounded-xs",
              "text-muted-foreground hover:text-foreground",
              "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
              "disabled:cursor-not-allowed disabled:opacity-60"
            )}
          >
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

      {open && (hasSuggestions || showFreeform) ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className={cn(
            "absolute z-50 mt-1 w-full rounded-md border border-border bg-background shadow-md",
            "max-h-60 overflow-y-auto"
          )}
        >
          {suggestions.map((airport) => (
            <li
              key={airport.iata}
              role="option"
              aria-selected={airport.iata === value?.toUpperCase()}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelectAirport(airport.iata);
              }}
              className={cn(
                "min-h-[44px] cursor-pointer px-3 py-2 text-sm",
                "flex items-center gap-2",
                "hover:bg-muted focus:bg-muted",
                airport.iata === value?.toUpperCase() && "bg-muted font-medium"
              )}
            >
              <span className="font-mono text-xs text-muted-foreground w-6">
                {airport.iata}
              </span>
              <span>
                {airport.iata} / {airport.city}
              </span>
            </li>
          ))}

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
              {M4_UI_STRINGS.travelLeg_airport_placeholder}
            </li>
          ) : null}
        </ul>
      ) : null}

      {!open && showFreeform && !hasSuggestions ? (
        <p
          className="mt-1 text-xs text-muted-foreground italic cursor-pointer"
          onMouseDown={(e) => {
            e.preventDefault();
            handleSelectFreeform();
          }}
        >
          {M4_UI_STRINGS.travelLeg_airport_placeholder}
        </p>
      ) : null}
    </div>
  );
}
