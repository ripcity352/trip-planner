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
import { Hotel, PartyPopper, Plane, UtensilsCrossed, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { hideFromCelebrantBadge } from "@/lib/utils/celebrant-badge";
import { formatCost } from "@/lib/utils/format-cost";
import { MapsLink } from "./maps-link";
import { ItemRsvpChip } from "./item-rsvp-chip";
import { ItemFlagForm } from "./item-flag-form";
import { OrganizerFlagView } from "./organizer-flag-view";
import { EditItemFormSheet } from "./edit-item-form-sheet";
import { LodgingRoster } from "./lodging-roster";
import type {
  ItineraryItemMemberFlag,
  ItineraryItem,
  ItineraryItemRsvpStatus,
  LodgingAssignment,
  TripMember,
} from "@/lib/db/types";

// Kind → SVG icon (lucide-react). Replaces emoji icons per design-system
// §Iconography: emoji reserved for reactions / user-generated copy, app
// icons are lucide SVG at 1.75px stroke. Plane mirrors travel-leg-card's
// flight icon for the overlapping transport kind.
const KIND_ICON: Record<ItineraryItem["kind"], LucideIcon> = {
  event: PartyPopper,
  lodging: Hotel,
  transport: Plane,
  meal: UtensilsCrossed,
  activity: Zap,
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
  /** #484: trip date bounds — forwarded to EditItemFormSheet's range check. */
  tripStartsAt?: string | null;
  tripEndsAt?: string | null;
  /** #365: member flags for this item. Under organizer RLS this is every
   * member's flags; under member RLS it is already scoped to the viewer's
   * own rows (the M4 owner-reads-own SELECT policy). */
  itemFlags: ItineraryItemMemberFlag[];
  /** #394: trip-level "going" RSVP count — the per-head cost denominator. */
  inCount: number;
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
  tripStartsAt,
  tripEndsAt,
  itemFlags,
  inCount,
}: ItemCardProps) {
  const isHiddenFromCelebrant = item.visibility === "hide_from_celebrant";
  // Non-default visibility badge for organizers_only / custom — parity with
  // AnnouncementCard's VISIBILITY_LABEL mapping (#F8). hide_from_celebrant
  // keeps its own celebrant-name template below since it also gates the
  // celebrant-facing placeholder above.
  const nonCelebrantVisibilityLabel =
    item.visibility === "organizers_only"
      ? M3_UI_STRINGS.announcements_badge_organizers_only
      : item.visibility === "custom"
        ? M3_UI_STRINGS.announcements_badge_custom
        : null;

  // Celebrant sees only the placeholder
  if (isHiddenFromCelebrant && isCelebrant) {
    return (
      <div className="rounded-md border border-border bg-muted/40 px-4 py-3">
        <p className="text-muted-foreground text-sm font-medium italic">
          {M3_UI_STRINGS.itinerary_item_hidden_for_celebrant}
        </p>
      </div>
    );
  }

  const timeLabel = formatTimeRange(
    item.day,
    item.end_day,
    item.start_time,
    item.end_time
  );
  const KindIcon = KIND_ICON[item.kind];
  // #394: whole-dollar amounts render without cents; the per-head suffix
  // only appears once 2+ people are going (see formatCost).
  const costLabel = formatCost(item.cost_cents, item.currency, inCount);

  return (
    <article className="flex flex-col gap-3 rounded-md border border-border bg-card px-4 py-3">
      {/* Header row: kind icon + title + time + edit affordance (organizer) */}
      <div className="flex items-start gap-2">
        <KindIcon
          aria-hidden
          className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
          strokeWidth={1.75}
        />
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold leading-snug">{item.title}</h3>
          {timeLabel ? (
            <p className="text-muted-foreground mt-0.5 text-xs">{timeLabel}</p>
          ) : null}
          {costLabel ? (
            <p
              data-testid="item-cost"
              className="text-muted-foreground mt-0.5 text-xs"
            >
              {costLabel}
            </p>
          ) : null}
        </div>
        {isOrganizer ? (
          <EditItemFormSheet
            item={item}
            tripTimezone={tripTimezone}
            tripStartsAt={tripStartsAt}
            tripEndsAt={tripEndsAt}
          />
        ) : null}
      </div>

      {/* Organizer visibility badge — hide_from_celebrant keeps the amber
          celebrant-name template; organizers_only / custom get the neutral
          muted badge, matching AnnouncementCard's non-default treatment. */}
      {isHiddenFromCelebrant && isOrganizer ? (
        <span className="inline-flex w-fit items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
          {hideFromCelebrantBadge(celebrantName)}
        </span>
      ) : null}
      {nonCelebrantVisibilityLabel && isOrganizer ? (
        <span
          data-testid="visibility-badge"
          className="inline-flex w-fit items-center rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground"
        >
          {nonCelebrantVisibilityLabel}
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

      {/* #365: organizer read surface for member flags. Renders only when
          flags exist — a per-card "nothing yet" line is 375px noise. */}
      {isOrganizer && itemFlags.length > 0 ? (
        <OrganizerFlagView
          flags={itemFlags}
          memberNames={Object.fromEntries(
            tripMembers.flatMap((m) =>
              m.display_name ? [[m.id, m.display_name]] : []
            )
          )}
        />
      ) : null}

      {/* Per-item flag form — only for non-organizer members. itemFlags is
          RLS-scoped to the viewer's own rows here, so it doubles as the
          rehydration source (#365). Full rows pass through so custom flags
          (and their notes) render back as removable entries (#398). */}
      {!isOrganizer ? (
        <ItemFlagForm
          itemId={item.id}
          initialFlags={itemFlags.map(({ flag, note }) => ({ flag, note }))}
        />
      ) : null}
    </article>
  );
}

/**
 * Design-system date/time register, §"Cross-day time range": a same-day
 * range renders `7:00 pm – 9:00 pm` (en dash); when the item ends on a
 * later day (#504 `end_day`), the end gets its `Mmm d` date and the
 * separator becomes the Range-tier arrow: `8:00 am → Aug 18, 12:00 pm`.
 * Lowercase am/pm throughout (`aaa` — uppercase AM/PM is an anti-tell).
 */
function formatTimeRange(
  day: string,
  endDay: string | null,
  startTime: string | null,
  endTime: string | null
): string | null {
  if (!startTime) return null;

  // startTime is HH:MM from DB; parse against a reference date
  const parseTime = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const d = new Date(2000, 0, 1, h, m);
    return format(d, "h:mm aaa");
  };

  const start = parseTime(startTime);
  if (!endTime) return start;
  const end = parseTime(endTime);

  if (endDay && endDay !== day) {
    // Parse the YYYY-MM-DD parts directly — `new Date("YYYY-MM-DD")` would
    // interpret the string as UTC midnight and shift the day in western TZs.
    const [y, mo, d] = endDay.split("-").map(Number);
    const endDateLabel = format(new Date(y, mo - 1, d), "MMM d");
    return `${start} → ${endDateLabel}, ${end}`;
  }

  return `${start} – ${end}`;
}

// Export the cn helper so DaySection can pass class overrides down
export { cn };
