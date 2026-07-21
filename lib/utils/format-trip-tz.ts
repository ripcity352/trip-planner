/**
 * Date-fns-tz helpers for rendering and parsing datetime-local inputs in a
 * trip's timezone (Delta 5 from W0b adds `trips.timezone`).
 *
 * These are pure functions — no side effects, no imports from Next.js or
 * Supabase.  Safe to call on the server or client.
 *
 * Dependency: date-fns-tz (added as a direct dep in W2b — see PR body).
 */

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { parseISO, isValid, parse } from "date-fns";

// The format that <input type="datetime-local"> expects as its value attribute.
const DATETIME_LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm";

// Postgres `time without time zone` literal format used by
// itinerary_items.start_time / end_time.
const DB_TIME_FORMAT = "HH:mm:ss";

// day (YYYY-MM-DD) + DB time (HH:mm:ss) combined for parsing back into a
// wall-clock Date via date-fns `parse`.
const DAY_AND_DB_TIME_FORMAT = "yyyy-MM-dd'T'HH:mm:ss";

/**
 * Convert an ISO-8601 UTC string to the YYYY-MM-DDTHH:mm string required by
 * `<input type="datetime-local">`, rendered in the trip's timezone.
 *
 * Returns `""` for null, undefined, empty, or unparseable input so the
 * controlled input never receives `undefined`.
 */
export function toLocalInputValue(
  iso: string | null | undefined,
  tripTimezone: string
): string {
  if (!iso) return "";

  const date = parseISO(iso);
  if (!isValid(date)) return "";

  try {
    return formatInTimeZone(date, tripTimezone, DATETIME_LOCAL_FORMAT);
  } catch {
    return "";
  }
}

/**
 * Format an ISO-8601 UTC string as a human-readable datetime in the trip's
 * timezone, suitable for display in the arrivals manifest.
 *
 * Output format: `"MMM d, h:mm aaa"` — e.g. `"Aug 14, 10:30 am"`.
 * The `aaa` token yields lowercase `am`/`pm`, satisfying the design-system
 * date/time register (§"The five format tiers": absolute-time tier mandates
 * lowercase am/pm — uppercase is an anti-tell).
 *
 * Deterministic across runtimes: `formatInTimeZone` always resolves against
 * `tripTimezone`, never the process or browser ambient timezone. This is
 * what eliminates the React #418 hydration mismatch (#254) — SSR (UTC) and
 * CSR (browser-local) produce identical strings for the same instant.
 *
 * On bad input (invalid iso or timezone that throws), logs to console.error
 * and returns the raw `iso` string so a single malformed timestamp never
 * blows up the manifest render.
 */
export function formatTripDateTime(iso: string, tripTimezone: string): string {
  const date = parseISO(iso);
  if (!isValid(date)) {
    console.error("[arrivals] formatTripDateTime failed:", {
      iso,
      tripTimezone,
      err: new Error("invalid ISO string"),
    });
    return iso;
  }

  try {
    return formatInTimeZone(date, tripTimezone, "MMM d, h:mm aaa");
  } catch (err) {
    // Unlike toLocalInputValue/fromLocalInputValue (which silently return ""/null for bad input), a malformed stored timestamp reaching *display* is surprising — log it so the orchestrator notices. Do not "harmonize" by removing.
    console.error("[arrivals] formatTripDateTime failed:", {
      iso,
      tripTimezone,
      err,
    });
    return iso;
  }
}

/**
 * Human-readable city label for an IANA timezone, for microcopy like
 * "Times are Los Angeles time" (#382 travel-leg form caption).
 *
 * Last path segment with underscores as spaces; segment-less zones
 * ("UTC") fall back to the raw string.
 */
export function timezoneCityLabel(tripTimezone: string): string {
  const segment = tripTimezone.split("/").pop();
  return segment ? segment.replace(/_/g, " ") : tripTimezone;
}

/**
 * Parse the YYYY-MM-DDTHH:mm value from `<input type="datetime-local">` —
 * which is a wall-clock time in the trip's timezone — and return an
 * ISO-8601 UTC string.
 *
 * Returns `null` for empty or invalid input.
 */
export function fromLocalInputValue(
  localValue: string,
  tripTimezone: string
): string | null {
  if (!localValue.trim()) return null;

  // parse() needs a reference date; epoch is fine here since we provide
  // the full date+time string.
  const parsed = parse(localValue, DATETIME_LOCAL_FORMAT, new Date(0));
  if (!isValid(parsed)) return null;

  try {
    // fromZonedTime treats parsed as wall-clock time in tripTimezone and
    // returns the equivalent UTC Date.
    const utcDate = fromZonedTime(parsed, tripTimezone);
    return utcDate.toISOString();
  } catch {
    return null;
  }
}

/**
 * Fix B (P0 — itinerary time save): `itinerary_items.start_time` /
 * `end_time` are Postgres `time without time zone` columns. The client
 * sends a full UTC ISO-8601 instant (via `fromLocalInputValue`); the
 * server must reduce it to the trip-local wall-clock `HH:mm:ss` before
 * writing, or the insert/update fails at the DB layer (invalid input
 * syntax for type time).
 *
 * Returns `null` for null, undefined, or unparseable input so the server
 * action can pass it straight through as a column NULL.
 */
export function isoToDbTime(
  iso: string | null | undefined,
  tripTimezone: string
): string | null {
  if (!iso) return null;

  const date = parseISO(iso);
  if (!isValid(date)) return null;

  try {
    return formatInTimeZone(date, tripTimezone, DB_TIME_FORMAT);
  } catch {
    return null;
  }
}

/**
 * Fix B hydration inverse: combine an item's `day` (YYYY-MM-DD) with the
 * stored `HH:mm:ss` wall-clock time — interpreted in the trip's
 * timezone — back into a full UTC ISO-8601 instant.
 *
 * Needed because the edit form's zod schema validates startTime/endTime
 * with `.datetime()`, which rejects a bare `HH:mm:ss` DB value. Without
 * this, the default form value fails validation and blocks all edits of
 * an item that already has a time set.
 *
 * Returns `null` for missing/invalid `day` or `dbTime`.
 */
export function dbTimeToIso(
  day: string | null | undefined,
  dbTime: string | null | undefined,
  tripTimezone: string
): string | null {
  if (!day || !dbTime) return null;

  const parsed = parse(`${day}T${dbTime}`, DAY_AND_DB_TIME_FORMAT, new Date(0));
  if (!isValid(parsed)) return null;

  try {
    const utcDate = fromZonedTime(parsed, tripTimezone);
    return utcDate.toISOString();
  } catch {
    return null;
  }
}
