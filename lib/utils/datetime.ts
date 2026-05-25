/**
 * Datetime helpers for `<input type="datetime-local">` round-trips.
 *
 * The HTML input emits / accepts `YYYY-MM-DDTHH:MM` strings in the
 * viewer's local timezone — no seconds, no offset. Server schemas and
 * Postgres `timestamptz` columns expect ISO-8601 with a UTC offset.
 *
 * `fromDatetimeLocal` is the load-bearing piece: without it, a literal
 * `2026-05-23T15:45` string posts straight to the action layer and is
 * either (a) rejected by `z.string().datetime()` or (b) stored verbatim
 * by Postgres and reinterpreted as local-server / UTC, drifting the
 * stored instant by the viewer's offset on every round-trip.
 *
 * `toDatetimeLocal` is the inverse — used by edit forms to pre-populate
 * the input from a stored ISO timestamp.
 */

/**
 * Convert a `datetime-local` input value (local TZ, no offset) to an
 * ISO-8601 string with UTC offset. Empty / invalid input → null.
 */
export function fromDatetimeLocal(
  localInput: string | undefined | null,
): string | null {
  if (!localInput) return null;
  const d = new Date(localInput);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Convert an ISO timestamp to a `YYYY-MM-DDTHH:MM` string in the
 * viewer's local timezone — the only shape `<input type="datetime-local">`
 * accepts. Null / invalid input → empty string.
 *
 * Do NOT use `.slice(0, 16)` on the ISO string: that discards the UTC
 * offset and the input then interprets the value as local time,
 * shifting the stored instant by the viewer's offset on every edit
 * round-trip.
 */
export function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
