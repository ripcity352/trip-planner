import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

/**
 * Shared "Hidden from {name}" badge string for `hide_from_celebrant`
 * content (#405-B).
 *
 * Before this helper, three surfaces named the same semantic two ways:
 * the itinerary card interpolated the celebrant's display name ("Hidden
 * from Mike Groom" — warm, on-voice) while announcements and expenses fell
 * back to a generic "Hidden from the celebrant" that read like the spec
 * had leaked into the UI. The named form is the intended voice; this is
 * the single place that produces it, so all three stay in register.
 *
 * `celebrantName` is threaded from the page layer (the trip's celebrant
 * `trip_members.display_name`). When it's absent — an un-named celebrant
 * seat, unusual in production — we fall back to the generic noun so the
 * badge stays grammatical.
 */
export function hideFromCelebrantBadge(
  celebrantName?: string | null,
): string {
  const name = celebrantName?.trim() || M3_UI_STRINGS.celebrant_generic_fallback;
  return M3_UI_STRINGS.itinerary_item_visibility_hide_celebrant_badge.replace(
    "{name}",
    name,
  );
}
