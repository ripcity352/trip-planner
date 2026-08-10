/**
 * `/trips/[tripId]/roster` — member list with contact-export actions (#39, #40).
 *
 * Server Component. Fetches trip + members via the `lib/db/` layer.
 * The two interactive actions (vCard download, copy-all-numbers) live in
 * client sub-components inside `components/trip/roster/`.
 *
 * Access: any authenticated trip member can view the roster.
 * RLS guarantees non-members see nothing (notFound fallthrough).
 */

import { notFound } from "next/navigation";
import { eachDayOfInterval, format } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import { getTripBySlug, getViewerMember, getTripMembers } from "@/lib/db/trips";
import { getVisibleRsvpByMemberId } from "@/lib/db/rsvp";
import { getMemberDaysByTrip } from "@/lib/db/trip-member-days";
import { getPromptsByTrip } from "@/lib/db/rsvp-confirm-prompts";
import { isOrganizerRole } from "@/lib/utils/expense-visibility";
import { resolveMemberName } from "@/lib/utils/member-display";
import { parseDateOnly } from "@/lib/utils/date-only";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { RosterList } from "@/components/trip/roster/roster-list";
import { DayHeadcount } from "@/components/trip/day-headcount";
import {
  OrganizerMemberDaysPanel,
  type OrganizerDayTarget,
} from "@/components/trip/member-days/organizer-member-days-panel";
import {
  RsvpConfirmPromptSender,
  type RsvpPromptTarget,
} from "@/components/trip/rsvp/rsvp-confirm-prompt-sender";
import type { RosterMember } from "@/components/trip/roster/roster-list";
import type { TripMemberDayStatus } from "@/lib/db/types";

type PageProps = {
  params: Promise<{ tripId: string }>;
};

export default async function RosterPage({ params }: PageProps) {
  const { tripId: slug } = await params;
  const supabase = await createClient();

  const trip = await getTripBySlug(supabase, slug);
  if (!trip) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    notFound();
  }

  const viewer = await getViewerMember(supabase, trip.id, user.id);
  if (!viewer) {
    notFound();
  }

  // Fan out: members list + viewer-visible RSVP (#387). The RSVP read
  // MUST come from the trip_members_visible_rsvp view, never the raw
  // rsvp_status on trip_members — the view's case-when (declining
  // whispers) decides whether this viewer may see a declined status.
  const [rawMembers, visibleRsvp] = await Promise.all([
    getTripMembers(supabase, trip.id),
    getVisibleRsvpByMemberId(supabase, trip.id),
  ]);

  // Map to the RosterMember shape the component expects. isViewer flags the
  // signed-in user's own row so RosterList can render "You" instead of the
  // "Guest" fallback (#F5-partial — full identity-capture fix is #348).
  const members: RosterMember[] = rawMembers.map((m) => ({
    id: m.id,
    displayName: m.display_name,
    phone: m.phone_e164,
    role: m.role,
    isCelebrant: m.is_celebrant,
    isViewer: m.id === viewer.id,
    // undefined only if the view somehow missed the row — renders nothing.
    rsvp: visibleRsvp.get(m.id) ?? null,
  }));

  // #550 — organizer write-on-behalf targets: eligible members an organizer
  // may set day-availability for. Organizer-only (rule #11 — the affordance
  // never renders for non-organizers, and setMemberDayForAction re-checks
  // server-side + RLS). Excludes only the viewing organizer themselves (self
  // uses their own /me chips; RLS anti-forgery also rejects target == writer)
  // and trip-level decliners (#475 — out of the trip). Co-organizers ARE
  // eligible targets: unlike #171 (whose confirm surface rendered only for
  // non-organizers), the /me day chips render for every non-declined member,
  // so a co-organizer who volunteered dates still gets a keep/remove say.
  // Needs a dated trip to have chips to render.
  const viewerIsOrganizer = isOrganizerRole(viewer.role);
  let onBehalfTargets: OrganizerDayTarget[] = [];
  if (viewerIsOrganizer && trip.starts_at !== null && trip.ends_at !== null) {
    const allDays = await getMemberDaysByTrip(supabase, trip.id);
    // Group each member's stored day rows: member id → (date → status).
    const daysByMember = new Map<string, Map<string, TripMemberDayStatus>>();
    for (const row of allDays) {
      const perMember =
        daysByMember.get(row.trip_member_id) ??
        new Map<string, TripMemberDayStatus>();
      perMember.set(row.date, row.status);
      daysByMember.set(row.trip_member_id, perMember);
    }

    const memberNameMap = new Map(rawMembers.map((m) => [m.id, m]));
    const tripDates = eachDayOfInterval({
      start: parseDateOnly(trip.starts_at),
      end: parseDateOnly(trip.ends_at),
    }).map((d) => format(d, "yyyy-MM-dd"));

    onBehalfTargets = rawMembers
      .filter((m) => m.id !== viewer.id && m.rsvp_status !== "declined")
      .map((m) => {
        const stored = daysByMember.get(m.id);
        return {
          id: m.id,
          name: resolveMemberName(memberNameMap, m.id),
          days: tripDates.map((date) => ({
            date,
            status: stored?.get(date) ?? null,
          })),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // #549 — organizer RSVP confirm-prompt targets: any member except the
  // viewer. `alreadyAsked` surfaces a member's pending ask so the picker
  // shows a "· asked" cue (replace-not-stack). Organizer-only + RLS-gated.
  let rsvpPromptTargets: RsvpPromptTarget[] = [];
  if (viewerIsOrganizer) {
    const promptByMember = await getPromptsByTrip(supabase, trip.id);
    const memberNameMap = new Map(rawMembers.map((m) => [m.id, m]));
    rsvpPromptTargets = rawMembers
      .filter((m) => m.id !== viewer.id)
      .map((m) => ({
        id: m.id,
        name: resolveMemberName(memberNameMap, m.id),
        alreadyAsked: promptByMember.get(m.id) ?? null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {M3_UI_STRINGS.roster_pageTitle}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{trip.name}</p>
      </header>

      {/* #388/#524 — per-day "Who's around when" block, all members
          (self-contained; single mount) */}
      <DayHeadcount
        tripId={trip.id}
        tripSlug={slug}
        startsAt={trip.starts_at}
        endsAt={trip.ends_at}
        timezone={trip.timezone}
        // #552 — organizer-only "not set" marker on greyed rows. Display
        // affordance (rule #11), not an access gate: the day rows are
        // member-readable via RLS; organizers just get the extra cue.
        // isOrganizerRole keeps this in lockstep with is_trip_organizer.
        viewerIsOrganizer={isOrganizerRole(viewer.role)}
      />

      {/* #550 — organizer-only "set someone's days" editor. Sits directly
          under the read-only "Who's around when" block (the data it edits)
          so an organizer finds it where they'd look to change a member's
          days, not buried below the whole roster. The block itself stays
          read-only; this is the separate write surface (rule #11). */}
      {viewerIsOrganizer ? (
        <OrganizerMemberDaysPanel tripId={trip.id} targets={onBehalfTargets} />
      ) : null}

      <RosterList
        members={members}
        tripName={trip.name}
        tripSlug={slug}
        tripId={trip.id}
        viewerRole={viewer.role}
      />

      {/* #549 — organizer-only "confirm someone's RSVP" sender. The member
          confirms with their own tap on the dashboard; this only sends the
          ask. */}
      {viewerIsOrganizer ? (
        <RsvpConfirmPromptSender tripId={trip.id} targets={rsvpPromptTargets} />
      ) : null}
    </section>
  );
}
