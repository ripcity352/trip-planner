/**
 * RosterList — Server Component.
 *
 * Renders the member list with display name, role badge, phone (if
 * present), a quiet per-name RSVP chip (#387), and — for organizer
 * viewers — the per-row MemberManage affordance (#386). Includes the
 * two contact-export CTAs (VCardDownloadButton, CopyNumbersButton) at
 * the top.
 *
 * Phone filtering:
 *   - Members without a phone are shown in the list but excluded from
 *     both export paths.
 *
 * RSVP chips (#387 — anti-shame boundary is BINDING):
 *   - 'going' renders NOTHING — the default row is unmarked.
 *   - 'maybe' / 'pending' get a hairline chip (member-visible, factual).
 *   - 'declined' renders a chip only when the visible-rsvp view let the
 *     status through (organizer viewer or own row); a redacted decline
 *     arrives as null and renders exactly like going.
 *   - No ordering by lateness, no nudge copy, no counts.
 */

import Link from "next/link";
import { M3_UI_STRINGS, M5_UI_STRINGS, EMPTY_STATES } from "@/lib/copy/empty-states";
import type { RsvpStatus, TripRole } from "@/lib/db/types";
import { VCardDownloadButton } from "./vcard-download-button";
import { CopyNumbersButton } from "./copy-numbers-button";
import { MemberManage } from "./member-manage";

export interface RosterMember {
  id: string;
  displayName: string | null;
  phone: string | null;
  role: TripRole;
  isCelebrant: boolean;
  /**
   * True when this row is the signed-in viewer's own trip_member row.
   * Own-row rendering shows "You" regardless of display_name (#F5-partial —
   * the full identity-capture fix is gated behind #348). Optional so
   * existing callers/tests that don't thread a viewer id keep working.
   */
  isViewer?: boolean;
  /**
   * Viewer-visible RSVP state (#387), sourced from
   * `trip_members_visible_rsvp` — NEVER the raw table. `null` means the
   * view redacted a decline for this viewer; `undefined` means the
   * caller didn't thread RSVP at all. Both render nothing.
   */
  rsvp?: RsvpStatus | null;
}

interface RosterListProps {
  members: RosterMember[];
  tripName: string;
  /** URL slug for the trip — used to build the invite CTA href. */
  tripSlug?: string;
  /** Viewer's role — gates the invite CTA and the manage affordance. */
  viewerRole?: TripRole;
  /**
   * Trip UUID — required by the #386 member-manage actions. The manage
   * affordance only renders when this is threaded (defensive: existing
   * callers without it keep the read-only roster).
   */
  tripId?: string;
}

/** Organizer roles that may mint invites. */
const ORGANIZER_ROLES: ReadonlySet<TripRole> = new Set([
  "organizer",
  "co_organizer",
]);

/** Returns a human-readable role label from the copy palette, or null. */
function roleLabel(role: TripRole, isCelebrant: boolean): string | null {
  if (isCelebrant) {
    return M3_UI_STRINGS.roster_role_celebrant;
  }
  if (role === "organizer") {
    return M3_UI_STRINGS.roster_role_organizer;
  }
  if (role === "co_organizer") {
    return M3_UI_STRINGS.roster_role_co_organizer;
  }
  return null;
}

/**
 * #387 chip label per visible RSVP state, or null for "render nothing"
 * (going, redacted-decline null, and callers that don't thread rsvp).
 */
function rsvpChipLabel(rsvp: RsvpStatus | null | undefined): string | null {
  if (rsvp === "maybe") {
    return M5_UI_STRINGS.roster_chip_maybe;
  }
  if (rsvp === "pending") {
    return M5_UI_STRINGS.roster_chip_invited;
  }
  if (rsvp === "declined") {
    return M5_UI_STRINGS.roster_chip_declined;
  }
  return null;
}

export function RosterList({
  members,
  tripName,
  tripSlug,
  viewerRole,
  tripId,
}: RosterListProps) {
  const canInvite =
    viewerRole !== undefined && ORGANIZER_ROLES.has(viewerRole);
  // FOUNDER predicate (role='organizer' — the seat minted once by
  // create_trip_with_organizer; same predicate as is_trip_founder).
  // Celebrant assignment is founder-only, stricter than canInvite.
  const viewerIsFounder = viewerRole === "organizer";
  // Current guest of honor, if the seat is held — threaded into the
  // manage panel so the reassign confirm can name who steps back.
  const currentCelebrant = members.find((m) => m.isCelebrant);
  const currentCelebrantName = currentCelebrant
    ? currentCelebrant.displayName ?? M3_UI_STRINGS.roster_member_fallback_name
    : null;
  // Members with a stored phone — used for both export paths.
  const membersWithPhone = members
    .filter((m): m is RosterMember & { phone: string } => m.phone !== null)
    .map((m) => ({
      name: m.displayName ?? M3_UI_STRINGS.roster_member_fallback_name,
      phone: m.phone,
    }));

  const phoneNumbers = membersWithPhone.map((m) => m.phone);

  return (
    <div>
      {/* Section heading + organizer invite CTA */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold tracking-tight">
          {M3_UI_STRINGS.roster_heading}
        </h2>
        {canInvite && tripSlug ? (
          <Link
            href={`/trips/${tripSlug}/invites`}
            className="text-sm font-medium text-primary"
          >
            {M3_UI_STRINGS.crew_invite_cta}
          </Link>
        ) : null}
      </div>

      {/* Export CTAs */}
      <div className="flex flex-wrap gap-3 mb-6">
        <VCardDownloadButton members={membersWithPhone} tripName={tripName} />
        <CopyNumbersButton phones={phoneNumbers} />
      </div>

      {/* "No phones in roster" hint shown when both CTAs are disabled. */}
      {membersWithPhone.length === 0 && members.length > 0 ? (
        <p className="text-xs text-muted-foreground mb-4">
          {M3_UI_STRINGS.roster_no_numbers}
        </p>
      ) : null}

      {/* Member list */}
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">{EMPTY_STATES.members}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {members.map((member) => {
            const label = roleLabel(member.role, member.isCelebrant);
            const chipLabel = rsvpChipLabel(member.rsvp);
            // #386 — role/remove manage renders for organizer viewers,
            // and never on your own row, the celebrant, or the founder.
            // The server action re-checks every guard; hiding here is
            // rule 11 (micro-affordances, not access-denied messages).
            const manageable =
              canInvite &&
              tripId !== undefined &&
              !member.isViewer &&
              !member.isCelebrant &&
              member.role !== "organizer";
            // Celebrant assignment — FOUNDER only, never on the
            // founder's own row or seat. On the current celebrant's row
            // this is the ONLY move (clear-mode), so the affordance
            // renders there too — for the founder alone.
            const celebrantEligible =
              viewerIsFounder &&
              tripId !== undefined &&
              !member.isViewer &&
              member.role !== "organizer";
            const showManage =
              manageable || (celebrantEligible && member.isCelebrant);
            return (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-y-2 rounded-md border border-border px-4 py-3 min-h-11"
              >
                <span className="min-w-0 flex-1 truncate font-medium text-sm">
                  {member.isViewer
                    ? M3_UI_STRINGS.roster_member_you
                    : member.displayName ?? M3_UI_STRINGS.roster_member_fallback_name}
                </span>
                {/* flex-1 + flex-wrap so the open manage panel (w-full)
                    wraps onto its own line instead of squeezing the row */}
                <div className="flex flex-1 flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
                  {member.phone && (
                    <span className="tabular-nums">{member.phone}</span>
                  )}
                  {chipLabel && (
                    <span className="rounded-full border border-border px-2 py-0.5 font-medium">
                      {chipLabel}
                    </span>
                  )}
                  {label && (
                    <span className="rounded-full bg-muted px-2 py-0.5 font-medium capitalize">
                      {label}
                    </span>
                  )}
                  {showManage && tripId ? (
                    <MemberManage
                      tripId={tripId}
                      memberId={member.id}
                      memberName={
                        member.displayName ??
                        M3_UI_STRINGS.roster_member_fallback_name
                      }
                      currentRole={
                        member.role === "co_organizer"
                          ? "co_organizer"
                          : "attendee"
                      }
                      celebrant={
                        celebrantEligible
                          ? {
                              isCelebrant: member.isCelebrant,
                              // Null on the holder's own row — their
                              // clear confirm uses memberName instead.
                              currentCelebrantName: member.isCelebrant
                                ? null
                                : currentCelebrantName,
                            }
                          : undefined
                      }
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
