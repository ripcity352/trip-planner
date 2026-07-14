/**
 * Abbreviated relative time — the design-system "Relative" tier
 * (notes/design-system.md §"The five format tiers"): lowercase,
 * abbreviated units ("22h", "3d"), never date-fns'
 * `formatDistanceToNow` verbose form ("about 22 hours ago" is a named
 * anti-tell).
 *
 * Pure function — callers pass `now` explicitly (server clock on RSC
 * pages) so renders are deterministic and tests don't race the clock.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

/**
 * "now" (< 1 min), then "5m" / "22h" / "3d" / "2w". Future timestamps
 * (clock skew) clamp to "now" rather than rendering a negative.
 */
export function formatRelativeShort(date: Date, now: Date): string {
  const delta = now.getTime() - date.getTime();
  if (delta < MINUTE_MS) return "now";
  if (delta < HOUR_MS) return `${Math.floor(delta / MINUTE_MS)}m`;
  if (delta < DAY_MS) return `${Math.floor(delta / HOUR_MS)}h`;
  if (delta < WEEK_MS) return `${Math.floor(delta / DAY_MS)}d`;
  return `${Math.floor(delta / WEEK_MS)}w`;
}
