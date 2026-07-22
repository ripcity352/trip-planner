import type { TripVisibility } from "@/lib/db/types";

/**
 * Celebrant gap-day detection (#480, per the 2026-05-20 decoy-item ADR).
 *
 * A "gap day" is a day whose items are ALL invisible to the celebrant —
 * the day silently vanishes from the celebrant's itinerary, so they can
 * unknowingly double-book that slot. Organizers get a quiet read-time
 * note (see DaySection); this helper is the pure predicate behind it.
 *
 * Visibility mapping:
 *   - `everyone`            → celebrant-visible
 *   - `custom`              → treated as celebrant-visible. Conservative
 *     simplification: we don't consult `content_visibility_grants`, so a
 *     custom grant that excludes the celebrant is a documented false
 *     negative. Harmless — the nudge is advisory, never a gate.
 *   - `hide_from_celebrant` → not visible
 *   - `organizers_only`     → not visible
 *
 * An empty list is NOT a gap: no items at all means the day doesn't
 * render for anyone, which is honest — nothing is being hidden.
 */
export function isCelebrantGapDay(
  items: ReadonlyArray<{ visibility: TripVisibility }>
): boolean {
  if (items.length === 0) {
    return false;
  }
  return items.every(
    (item) =>
      item.visibility === "hide_from_celebrant" ||
      item.visibility === "organizers_only"
  );
}
