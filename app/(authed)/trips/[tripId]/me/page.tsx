/**
 * `/trips/[tripId]/me` — personal profile skeleton.
 *
 * M4 W0d: minimal surface. Per Voice CRITICAL C1 and the explicit
 * "out of scope" line in the M4 plan:
 *   - NO completion UI
 *   - NO progress bars
 *   - NO counts / scores / completeness meters
 *   - NO settings, notification preferences, badges, or mascot
 *
 * Ships: display name (from trip_members), email (from auth.getUser()),
 * and a "Sign out" button wired to the existing signOut server action.
 *
 * The `tripId` param is the trip slug (same naming convention as all
 * other routes under [tripId]).
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { eachDayOfInterval, format } from "date-fns";

import { createClient } from "@/lib/supabase/server";
import { getTripBySlug } from "@/lib/db/trips";
import { getViewerMember } from "@/lib/db/trips";
import { getMemberDays } from "@/lib/db/trip-member-days";
import { signOut } from "@/lib/actions/auth";
import { M4_UI_STRINGS, MEMBER_DAYS_UI_STRINGS } from "@/lib/copy/empty-states";
import { AUTH_COPY } from "@/lib/copy/auth";
import { parseDateOnly } from "@/lib/utils/date-only";
import {
  DayAttendanceChips,
  type DayChip,
} from "@/components/trip/day-attendance-chips";

type PageProps = {
  params: Promise<{ tripId: string }>;
};

export default async function MePage({ params }: PageProps) {
  const { tripId } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Layout guard ensures user is present, but be defensive.
  if (!user) {
    notFound();
  }

  const trip = await getTripBySlug(supabase, tripId);
  if (!trip) {
    notFound();
  }

  const member = await getViewerMember(supabase, trip.id, user.id);
  if (!member) {
    // Not a trip member — treat as not found to avoid leaking trip existence.
    notFound();
  }

  const displayName =
    member.display_name ?? user.email ?? M4_UI_STRINGS.me_display_name_fallback;
  const email = user.email ?? "";

  // #388 — day-scoped attendance chips. One chip per trip date; the
  // member's stored rows overlay onto the range (null = never seeded,
  // e.g. rsvp maybe/pending — the chips upsert from empty). Date-less
  // trips skip the section entirely.
  let dayChips: DayChip[] = [];
  if (trip.starts_at !== null && trip.ends_at !== null) {
    const rows = await getMemberDays(supabase, member.id);
    const statusByDate = new Map(rows.map((r) => [r.date, r.status]));
    dayChips = eachDayOfInterval({
      start: parseDateOnly(trip.starts_at),
      end: parseDateOnly(trip.ends_at),
    }).map((d) => {
      const iso = format(d, "yyyy-MM-dd");
      return { date: iso, status: statusByDate.get(iso) ?? null };
    });
  }

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {M4_UI_STRINGS.me_page_heading}
        </h1>
      </header>

      <div className="flex flex-col gap-4">
        <div className="border-border bg-card rounded-md border p-4 shadow-sm">
          <dl className="flex flex-col gap-3">
            <div>
              <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {M4_UI_STRINGS.me_label_name}
              </dt>
              <dd className="text-foreground mt-0.5 text-sm">{displayName}</dd>
            </div>
            {email ? (
              <div>
                <dt className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                  {M4_UI_STRINGS.me_label_email}
                </dt>
                <dd className="text-foreground mt-0.5 text-sm">{email}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        {/* #388 — which days are you around? (rule 8: opt-in framing) */}
        {dayChips.length > 0 ? (
          <div className="border-border bg-card rounded-md border p-4 shadow-sm">
            <h2 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              {MEMBER_DAYS_UI_STRINGS.memberDays_heading}
            </h2>
            <p className="text-muted-foreground mt-0.5 mb-3 text-sm">
              {MEMBER_DAYS_UI_STRINGS.memberDays_subhead}
            </p>
            <DayAttendanceChips tripId={trip.id} days={dayChips} />
            {/* Glanceability sweep: reciprocal wayfinding to the roster's
                organizer-only DayHeadcount block these chips feed.
                Organizer-gated so the link never promises a block the
                viewer's roster won't render (rule 11 — no dead ends). */}
            {member.role === "organizer" || member.role === "co_organizer" ? (
              <Link
                href={`/trips/${tripId}/roster`}
                className="text-primary mt-3 inline-block text-sm underline-offset-4 hover:underline"
              >
                {MEMBER_DAYS_UI_STRINGS.memberDays_link_to_headcount}
              </Link>
            ) : null}
          </div>
        ) : null}

        {/* Sign-in & security navigation link (M5/PR4) */}
        <Link
          href="/account/sign-in-and-security"
          className="focus-visible:ring-ring border-border bg-card text-foreground hover:bg-muted/40 flex w-full items-center justify-between rounded-md border px-4 py-3 text-sm font-medium shadow-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <span>{AUTH_COPY.accountSecurity_meNavLink}</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </Link>

        <form action={signOut}>
          <button
            type="submit"
            className="focus-visible:ring-ring border-border bg-muted text-muted-foreground hover:bg-muted/80 w-full rounded-xs border px-5 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {M4_UI_STRINGS.me_sign_out_cta}
          </button>
        </form>
      </div>
    </section>
  );
}
