/**
 * `parseDateOnly` — parses a Postgres `date` column value
 * (`'YYYY-MM-DD'`, no time-of-day, no offset) as local midnight.
 *
 * Hazard this prevents: `new Date('YYYY-MM-DD')` is parsed by the JS
 * spec as UTC midnight, not local midnight. Anywhere west of UTC (all
 * of the US) that renders one calendar day early — a trip starting
 * '2027-03-12' shows as "Mar 11" on a US machine. Every render of a
 * date-only column must go through this wrapper instead of the native
 * `Date` constructor. See notes/design-system.md "Parsing axis
 * (date-only columns)" (#350).
 */

import { parseISO } from "date-fns";

export function parseDateOnly(dateString: string): Date {
  return parseISO(dateString);
}
