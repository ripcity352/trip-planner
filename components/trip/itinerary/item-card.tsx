/**
 * ItemCard — renders a single itinerary item.
 *
 * Server Component. Mounts client sub-components for interactive surfaces
 * (ItemRsvpChip, ItemFlagForm, MapsLink, EditItemFormSheet, LodgingRoster).
 *
 * Visibility rules:
 *   - `hide_from_celebrant` + viewer is celebrant → show placeholder only
 *   - `hide_from_celebrant` + viewer is organizer → show full card + badge
 *   - All other visibility values → show full card (RLS already filtered)
 */

import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { MapsLink } from "./maps-link";
import { ItemRsvpChip } from "./item-rsvp-chip";
import { ItemFlagForm } from "./item-flag-form";
import { EditItemFormSheet } from "./edit-item-form-sheet";
import { LodgingRoster } from "./lodging-roster";
import type {
  ItineraryItem,
  ItineraryItemRsvpStatus,
  LodgingAssignment,
  TripMember,
} from "@/lib/db/types";

// Kind → emoji icon mapping. No dep — just a lookup.
const KIND_ICON: Record<ItineraryItem["kind"], string> = {
  event: "🎉",
  lodging: "🏨",
  transport: "✈️",
  meal: "🍽️",
  activity: "⚡",
};

export interface ItemCardProps {
  item: ItineraryItem;
  /** Caller's RSVP status for this item. null = inherited day-level RSVP. */
  myRsvpStatus: ItineraryItemRsvpStatus | null;
  isOrganizer: boolean;
  isCelebrant: boolean;
  /** Celebrant display name — used in the organizer visibility badge. */
  celebrantName?: string;
  /** Pre-fetched lodging assignments for this item (empty array for non-lodging items). */
  lodgingAssignments: LodgingAssignment[];
  /** All trip members — used by LodgingRoster to display names. */
  tripMembers: TripMember[];
  /** IANA timezone from `trips.timezone` — forwarded to EditItemFormSheet. */
  tripTimezone: string;
}

export function ItemCard({
  item,
  myRsvpStatus,
  isOrganizer,
  isCelebrant,
  celebrantName,
  lodgingAssignments,
  tripMembers,
  tripTimezone,
}: ItemCardProps) {
  const isHiddenFromCelebrant = item.visibility === "hide_from_celebrant";

  // Celebrant sees only the placeholder
  if (isHiddenFromCelebrant && isCelebrant) {
    return (
      <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
        <p className="text-muted-foreground text-sm font-medium italic">
          {M3_UI_STRINGS.itinerary_item_hidden_for_celebrant}
        </p>
      </div>
    );
  }

  const timeLabel = formatTimeRange(item.start_time, item.end_time);

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3">
      {/* Header row: kind icon + title + time + edit affordance (organizer) */}
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-0.5 text-base leading-none">
          {KIND_ICON[item.kind]}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-snug">{item.title}</h3>
          {timeLabel ? (
            <p className="text-muted-foreground mt-0.5 text-xs">{timeLabel}</p>
          ) : null}
        </div>
        {isOrganizer ? (
          <EditItemFormSheet item={item} tripTimezone={tripTimezone} />
        ) : null}
      </div>

      {/* Organizer visibility badge */}
      {isHiddenFromCelebrant && isOrganizer ? (
        <span className="inline-flex w-fit items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {M3_UI_STRINGS.itinerary_item_visibility_hide_celebrant_badge.replace(
            "{name}",
            celebrantName ?? "the celebrant"
          )}
        </span>
      ) : null}

      {/* Address → Maps deep link */}
      {item.address ? (
        <MapsLink address={item.address} />
      ) : null}

      {/* Dress code */}
      {item.dress_code ? (
        <p className="text-muted-foreground text-xs">
          {M3_UI_STRINGS.itinerary_item_dress_code_template.replace(
            "{code}",
            item.dress_code
          )}
        </p>
      ) : null}

      {/* Activity tags */}
      {item.activity_tag.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {item.activity_tag.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {/* Lodging room roster — only for lodging items */}
      {item.kind === "lodging" ? (
        <LodgingRoster
          itemId={item.id}
          assignments={lodgingAssignments}
          tripMembers={tripMembers}
          isOrganizer={isOrganizer}
        />
      ) : null}

      {/* Per-item RSVP chip */}
      <ItemRsvpChip itemId={item.id} initialStatus={myRsvpStatus} />

      {/* Per-item flag form — only for non-organizer members
          (organizer read surface ships in Wave 4) */}
      {!isOrganizer ? (
        <ItemFlagForm itemId={item.id} />
      ) : null}
    </article>
  );
}

function formatTimeRange(
  startTime: string | null,
  endTime: string | null
): string | null {
  if (!startTime) return null;

  // startTime is HH:MM from DB; parse against a reference date
  const parseTime = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const d = new Date(2000, 0, 1, h, m);
    return format(d, "h:mm a");
  };

  const start = parseTime(startTime);
  if (!endTime) return start;
  const end = parseTime(endTime);
  return `${start} – ${end}`;
}

// Export the cn helper so DaySection can pass class overrides down
export { cn };
