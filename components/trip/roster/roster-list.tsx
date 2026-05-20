/**
 * RosterList — Server Component.
 *
 * Renders the member list with display name, role badge, and phone (if
 * present). Includes the two contact-export CTAs (VCardDownloadButton,
 * CopyNumbersButton) at the top.
 *
 * Phone filtering:
 *   - Members without a phone are shown in the list but excluded from
 *     both export paths.
 */

import { M3_UI_STRINGS, EMPTY_STATES } from "@/lib/copy/empty-states";
import type { TripRole } from "@/lib/db/types";
import { VCardDownloadButton } from "./vcard-download-button";
import { CopyNumbersButton } from "./copy-numbers-button";

export interface RosterMember {
  id: string;
  displayName: string | null;
  phone: string | null;
  role: TripRole;
  isCelebrant: boolean;
}

interface RosterListProps {
  members: RosterMember[];
  tripName: string;
}

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

export function RosterList({ members, tripName }: RosterListProps) {
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
      {/* Section heading */}
      <h2 className="text-xl font-semibold tracking-tight mb-4">
        {M3_UI_STRINGS.roster_heading}
      </h2>

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
            return (
              <li
                key={member.id}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-3 min-h-11"
              >
                <span className="font-medium text-sm">
                  {member.displayName ?? M3_UI_STRINGS.roster_member_fallback_name}
                </span>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {member.phone && (
                    <span className="tabular-nums">{member.phone}</span>
                  )}
                  {label && (
                    <span className="rounded-full bg-muted px-2 py-0.5 font-medium capitalize">
                      {label}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
