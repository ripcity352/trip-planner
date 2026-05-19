/**
 * Shared date-range formatter for the date-poll slices. Avoids
 * duplication between celebrant + member views; lives next to them
 * because it's specific to the candidate range shape.
 */

import { format, parseISO } from "date-fns";

export function formatDateRange(startsOn: string, endsOn: string): string {
  const start = parseISO(startsOn);
  const end = parseISO(endsOn);
  if (startsOn === endsOn) {
    return format(start, "MMM d, yyyy");
  }
  const sameYear = start.getFullYear() === end.getFullYear();
  if (sameYear) {
    return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
  }
  return `${format(start, "MMM d, yyyy")} – ${format(end, "MMM d, yyyy")}`;
}
