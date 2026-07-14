/**
 * `/trips/[tripId]` — trip dashboard.
 *
 * IMPORTANT: the URL segment is the trip's `slug`, not its UUID. We
 * keep the parameter named `tripId` because the file lives at
 * `[tripId]/` and renaming the segment would churn the route group.
 * The trade-off is documented here so a future reader doesn't go hunt
 * for a uuid mapping that doesn't exist.
 *
 * The page reads the trip via `getTripBySlug`. RLS gates visibility to
 * members; non-member access returns `null` from the DB layer, which
 * we surface as a `notFound()` — identical 404 for "doesn't exist" and
 * "not your trip" so a hostile prober can't enumerate slugs.
 *
 * Wave 2a shipped the skeleton + invite-link area. Wave 2b (this slice)
 * wires the glanceable RSVP counts + the 3-state RSVP toggle, sourcing
 * counts from `trip_members_visible_rsvp` (NOT raw `trip_members`) per
 * the declining-whispers ADR. The organizer-only "(N can't make it)"
 * suffix is gated by an `is_trip_organizer()` RPC check; RLS does the
 * same gating at the row level as defense-in-depth.
 *
 * Wave 3b (M3) addition: NowNextCard + TripNotesEditor wired into the
 * dashboard. The dashboard fetches the full item list via
 * `getItineraryByTrip` so the now/next pure function can compute the
 * current/next pair (a single-item-preview helper was tried and deleted).
 *
 * Wave 5 (M3) closure addition: link cards for the five M3 sub-routes
 * (Itinerary, Announcements, Arrivals, Roster, Invites). Invites is
 * organizer-only — the dashboard hides the affordance for non-organizers
 * so a member dashboard isn't peppered with dead-end links. Page-level
 * RPC gate on /invites/page.tsx is the load-bearing security check.
 */

import { format } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RsvpToggle } from "@/components/trip/rsvp-toggle";
import { NowNextCard } from "@/components/trip/now-next-card";
import { TripNotesEditor } from "@/components/trip/trip-notes-editor";
import { EditTripSheet } from "@/components/trip/edit-trip-sheet";
import { getTripBySlug, getViewerMember } from "@/lib/db/trips";
import {
  getMyRsvp,
  getOrganizerDeclinedCount,
  getRsvpCountsForTrip,
} from "@/lib/db/rsvp";
import { getItineraryByTrip } from "@/lib/db/itinerary";
import { getTripNotes } from "@/lib/db/trip-notes";
import { isDatePollDecided } from "@/lib/db/date-poll";
import { getLatestAnnouncement } from "@/lib/db/announcements";
import {
  getArrivalTimesByTrip,
  type ArrivalInstant,
} from "@/lib/db/travel-legs";
import { countOpenPolls } from "@/lib/db/polls";
import { countActiveInvites } from "@/lib/db/invites";
import { getExpensesByTrip, getSplitsByTrip } from "@/lib/db/expenses";
import { createClient } from "@/lib/supabase/server";
import { parseDateOnly } from "@/lib/utils/date-only";
import { whatsHappeningNow } from "@/lib/utils/whats-happening-now";
import { formatNextWhen } from "@/lib/utils/itinerary-when";
import { formatRelativeShort } from "@/lib/utils/relative-short";
import {
  computeViewerNetPosition,
  summarizeArrivals,
} from "@/lib/utils/dashboard-glance";
import { formatCents } from "@/lib/utils/format-cents";
import {
  DASHBOARD_GLANCE_STRINGS,
  EMPTY_STATES,
  M5_UI_STRINGS, M2_UI_STRINGS, M3_UI_STRINGS } from "@/lib/copy/empty-states";
import type { Trip } from "@/lib/db/types";

type PageProps = {
  // Next.js 16 — dynamic segment params are async.
  params: Promise<{ tripId: string }>;
};

export default async function TripDashboardPage({ params }: PageProps) {
  const { tripId } = await params;

  const supabase = await createClient();
  const trip = await getTripBySlug(supabase, tripId);

  if (!trip) {
    notFound();
  }

  // The auth gate above (`app/(authed)/layout.tsx`) guarantees a user
  // is present, but the data-layer call wants the explicit uid for the
  // self-RSVP narrow. We read it once and pass it in — cheaper than
  // re-resolving auth inside getMyRsvp.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    // Defensive: layout guard should have redirected already. If we
    // somehow got here, redirect to a 404 so we don't leak the trip
    // existence to an unauthenticated caller.
    notFound();
  }

  // One server-clock instant for every glance computation on this render.
  const now = new Date();
  const todayIso = format(now, "yyyy-MM-dd");

  // Fan out independent reads in parallel.
  // Wave 3b: getItineraryByTrip gives the now/next pure function the full
  // item list. getTripNotes is a focused read of trips.notes without
  // pulling the full Trip row again.
  // Glanceability sweep adds the link-card context-line reads — each is
  // deliberately cheap (limit-1 / head-count / single-column; expenses +
  // splits are full-but-tiny tables at bachelor-party scale).
  const [
    counts,
    myRsvp,
    organizerCheck,
    allItems,
    tripNotes,
    viewer,
    latestAnnouncement,
    arrivalTimes,
    openPollCount,
    expenses,
    splits,
  ] = await Promise.all([
    getRsvpCountsForTrip(supabase, trip.id),
    getMyRsvp(supabase, trip.id, user.id),
    supabase.rpc("is_trip_organizer", { p_trip_id: trip.id }),
    getItineraryByTrip(supabase, trip.id),
    getTripNotes(supabase, trip.id),
    getViewerMember(supabase, trip.id, user.id),
    getLatestAnnouncement(supabase, trip.id),
    getArrivalTimesByTrip(supabase, trip.id),
    countOpenPolls(supabase, trip.id, todayIso),
    getExpensesByTrip(supabase, trip.id),
    getSplitsByTrip(supabase, trip.id),
  ]);

  const isOrganizer = organizerCheck.data === true;

  // Organizer-only reads are gated TWICE: the page won't issue them
  // unless `isOrganizer` is true, AND RLS (trip_members / #155 invites)
  // hides the rows from non-organizers regardless. The double-gate is
  // intentional defense-in-depth.
  const [declinedCount, activeInviteCount] = isOrganizer
    ? await Promise.all([
        getOrganizerDeclinedCount(supabase, trip.id),
        countActiveInvites(supabase, trip.id, now),
      ])
    : [0, 0];

  const countLine = formatRsvpCountLine({
    counts,
    isOrganizer,
    declinedCount,
  });

  // ---- Link-card glance lines (muted facts, never notifications) ----

  // Itinerary — same pure now/next computation NowNextCard runs, shared
  // via lib/utils so the two surfaces can't drift.
  const { now: currentItem, next: nextItem } = whatsHappeningNow(
    allItems,
    now
  );
  const glanceItem = nextItem ?? currentItem;
  const itineraryLine =
    glanceItem !== null
      ? [glanceItem.title, nextItem ? formatNextWhen(glanceItem, now) : null]
          .filter(Boolean)
          .join(" · ")
      : allItems.length > 0
        ? DASHBOARD_GLANCE_STRINGS.glance_itinerary_wrapped
        : EMPTY_STATES.itinerary;

  // Announcements — latest post's first line + abbreviated relative time.
  const announcementsLine = latestAnnouncement
    ? `${latestAnnouncement.body.split(/\r?\n/)[0]} · ${formatRelativeShort(
        new Date(latestAnnouncement.created_at),
        now
      )}`
    : EMPTY_STATES.announcements;

  // Open-poll discoverability line (polls render on the announcements
  // page; without this, non-organizers have no way to find them).
  const openPollsLine =
    openPollCount === 0
      ? null
      : openPollCount === 1
        ? DASHBOARD_GLANCE_STRINGS.glance_polls_open_one
        : DASHBOARD_GLANCE_STRINGS.glance_polls_open_other_template.replace(
            "{count}",
            String(openPollCount)
          );

  const arrivalsLine = formatArrivalsLine(arrivalTimes, now, trip.timezone);

  // Expenses — the viewer's OWN net position only (who-owes-who is
  // killed scope). Requires the viewer's member row for split pairing.
  const netPosition = viewer
    ? computeViewerNetPosition(expenses, splits, viewer.id, user.id)
    : null;
  const expensesLine =
    netPosition === null
      ? EMPTY_STATES.expenses
      : netPosition.netCents === 0
        ? DASHBOARD_GLANCE_STRINGS.glance_expenses_even
        : (netPosition.netCents > 0
            ? DASHBOARD_GLANCE_STRINGS.glance_expenses_up_template
            : DASHBOARD_GLANCE_STRINGS.glance_expenses_down_template
          ).replace(
            "{amount}",
            formatCents(Math.abs(netPosition.netCents), netPosition.currency)
          );

  const invitesLine =
    activeInviteCount === 0
      ? EMPTY_STATES.invites_for_trip
      : activeInviteCount === 1
        ? DASHBOARD_GLANCE_STRINGS.glance_invites_one
        : DASHBOARD_GLANCE_STRINGS.glance_invites_other_template.replace(
            "{count}",
            String(activeInviteCount)
          );

  const datesDecided = isDatePollDecided(trip);

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-6">
        {/* flex-wrap: the closed trigger sits beside the h1; the open
            form is w-full and wraps to its own line at any width. */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            {trip.name}
          </h1>
          {/* Organizer micro-affordance (rule 11) — non-organizers never
              see the trigger. Name + location only; dates stay with the
              /dates poll flow. RLS is the real gate on the write. */}
          {isOrganizer ? (
            <EditTripSheet
              tripId={trip.id}
              initialName={trip.name}
              initialLocation={trip.location}
              triggerClassName="shrink-0"
            />
          ) : null}
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          {formatTripDates(trip)}
          {trip.location ? ` · ${trip.location}` : null}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4">
        {/* Now/next card — Wave 3b (#77) */}
        <NowNextCard trip={trip} items={allItems} />

        <Card>
          <CardHeader>
            <CardTitle>{M2_UI_STRINGS.dashboard_section_rsvp_heading}</CardTitle>
            <CardDescription>{countLine}</CardDescription>
          </CardHeader>
          <CardContent>
            <RsvpToggle
              tripId={trip.id}
              initialStatus={myRsvp?.status ?? "pending"}
            />
          </CardContent>
        </Card>

        {/* Sub-route link cards — Itinerary (Wave 2), Announcements (3a),
            Arrivals (4a), Roster (4b), Invites (4c — organizer-only).
            Each lives under /trips/[slug]/<route>; the page-level RLS/role
            gate enforces actual visibility, the dashboard surfaces them
            so they're discoverable.
            Glanceability sweep: each card carries ONE muted context line
            (CardDescription) — read-only facts, truncated to a single
            line at 375px. No badges, no unread dots. */}

        {/* Dates poll — urgency-proportional placement. While the dates
            are UNDECIDED the poll is the most time-critical surface, so
            it gets a full link card at the top of the stack; once locked
            it demotes back to the small text link below (#369). */}
        {!datesDecided ? (
          <Link href={`/trips/${trip.slug}/dates`} className="block">
            <Card className="hover:bg-muted/40 transition-colors">
              <CardHeader>
                <CardTitle>{M2_UI_STRINGS.dashboard_dates_link_label}</CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ) : null}

        <Link href={`/trips/${trip.slug}/itinerary`} className="block">
          <Card className="hover:bg-muted/40 transition-colors">
            <CardHeader>
              <CardTitle>{M3_UI_STRINGS.itinerary_heading}</CardTitle>
              <CardDescription className="truncate">
                {itineraryLine}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href={`/trips/${trip.slug}/announcements`} className="block">
          <Card className="hover:bg-muted/40 transition-colors">
            <CardHeader>
              <CardTitle>{M3_UI_STRINGS.announcements_heading}</CardTitle>
              <CardDescription className="truncate">
                {announcementsLine}
              </CardDescription>
              {openPollsLine ? (
                <CardDescription className="truncate">
                  {openPollsLine}
                </CardDescription>
              ) : null}
            </CardHeader>
          </Card>
        </Link>

        <Link href={`/trips/${trip.slug}/arrivals`} className="block">
          <Card className="hover:bg-muted/40 transition-colors">
            <CardHeader>
              <CardTitle>{M3_UI_STRINGS.arrivals_heading}</CardTitle>
              <CardDescription className="truncate">
                {arrivalsLine}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href={`/trips/${trip.slug}/roster`} className="block">
          <Card className="hover:bg-muted/40 transition-colors">
            <CardHeader>
              <CardTitle>{M3_UI_STRINGS.roster_heading}</CardTitle>
              {/* Reuses the already-computed RSVP count line — no second query. */}
              <CardDescription className="truncate">{countLine}</CardDescription>
            </CardHeader>
          </Card>
        </Link>

        {/* Expenses — #372 MVP over the M1 schema. */}
        <Link href={`/trips/${trip.slug}/expenses`} className="block">
          <Card className="hover:bg-muted/40 transition-colors">
            <CardHeader>
              <CardTitle>{M5_UI_STRINGS.expenses_heading}</CardTitle>
              <CardDescription className="truncate">
                {expensesLine}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        {/* Invites — organizer-only. Page returns notFound() for
            non-organizers, but we still hide the affordance here as UX
            (so a non-organizer dashboard isn't peppered with dead links). */}
        {isOrganizer ? (
          <Link href={`/trips/${trip.slug}/invites`} className="block">
            <Card className="hover:bg-muted/40 transition-colors">
              <CardHeader>
                <CardTitle>{M3_UI_STRINGS.invitesPage_heading}</CardTitle>
                <CardDescription className="truncate">
                  {invitesLine}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ) : null}

        {/* Trip notes — Wave 3b (#78) */}
        <Card>
          <CardContent className="pt-4">
            <TripNotesEditor
              tripId={trip.id}
              initialNotes={tripNotes}
              isOrganizer={isOrganizer}
            />
          </CardContent>
        </Card>

        {/* Dates link, decided state only (#369): once the dates are
            locked the poll is archived — the promoted card above goes
            away and this quiet text link to the decided window remains.
            Server Component, no client behavior. */}
        {datesDecided ? (
          <Link
            href={`/trips/${trip.slug}/dates`}
            className="text-primary text-sm underline-offset-4 hover:underline"
          >
            {M2_UI_STRINGS.dashboard_dates_link_label_locked}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Arrivals glance line — aggregate counts + the next arrival instant,
 * rendered in the TRIP's timezone (same clock the arrivals manifest
 * uses; lowercase am/pm per the #211 absolute-time register). Never
 * names — no arrival forensics.
 */
function formatArrivalsLine(
  arrivalTimes: readonly ArrivalInstant[],
  now: Date,
  tripTimezone: string
): string {
  if (arrivalTimes.length === 0) {
    return M3_UI_STRINGS.arrivals_empty;
  }

  const { landed, nextArrival } = summarizeArrivals(arrivalTimes, now);
  const nextLabel =
    nextArrival !== null
      ? formatInTimeZone(nextArrival, tripTimezone, "EEE h:mm aaa")
      : null;

  if (landed > 0 && nextLabel) {
    return DASHBOARD_GLANCE_STRINGS.glance_arrivals_landed_next_template
      .replace("{landed}", String(landed))
      .replace("{when}", nextLabel);
  }
  if (landed > 0) {
    return DASHBOARD_GLANCE_STRINGS.glance_arrivals_all_landed_template.replace(
      "{landed}",
      String(landed)
    );
  }
  // landed === 0 and at least one leg exists → a future arrival must exist.
  return DASHBOARD_GLANCE_STRINGS.glance_arrivals_first_template.replace(
    "{when}",
    nextLabel ?? ""
  );
}

function formatTripDates(trip: Trip): string {
  if (trip.starts_at && trip.ends_at) {
    return `${format(parseDateOnly(trip.starts_at), "MMM d")} – ${format(
      parseDateOnly(trip.ends_at),
      "MMM d"
    )}`;
  }
  if (trip.starts_at) {
    return format(parseDateOnly(trip.starts_at), "MMM d");
  }
  return M2_UI_STRINGS.dashboard_dates_unset;
}

/**
 * Render the glanceable count line, e.g. "3 going, 1 maybe, 4 invited".
 * For organizers we append "(N can't make it)" — non-organizers never
 * see per-name decline data per the declining-whispers ADR, and the
 * count is gated at the same boundary.
 */
function formatRsvpCountLine(args: {
  counts: { going: number; maybe: number; invited: number };
  isOrganizer: boolean;
  declinedCount: number;
}): string {
  const { counts, isOrganizer, declinedCount } = args;
  const base = M2_UI_STRINGS.dashboard_rsvp_count_template
    .replace("{going}", String(counts.going))
    .replace("{maybe}", String(counts.maybe))
    .replace("{invited}", String(counts.invited));

  if (isOrganizer && declinedCount > 0) {
    return (
      base +
      M2_UI_STRINGS.dashboard_rsvp_count_declined_suffix.replace(
        "{count}",
        String(declinedCount)
      )
    );
  }
  return base;
}
