/**
 * InviteList — server-friendly list of active invite links.
 *
 * Each row shows: token (via the <Identifier> primitive — mono, truncated,
 * copy-on-tap), uses remaining, expiry, a copy-link button (client), and a
 * revoke button (client — calls revokeInviteAction).
 *
 * Server Component: the list itself is static. The client leaves are
 * <Identifier> (clipboard), CopyLinkButton (clipboard), and RevokeButton
 * (confirmation step). <Identifier> copies the raw token; CopyLinkButton
 * copies the full join URL — distinct affordances.
 *
 * Strings sourced from M3_UI_STRINGS / ERRORS per Override F.
 */

import { format } from "date-fns";

import { Identifier } from "@/components/ui/identifier";
import { EMPTY_STATES, M3_UI_STRINGS } from "@/lib/copy/empty-states";
import type { Invite } from "@/lib/db/types";
import { CopyLinkButton } from "./copy-link-button";
import { RevokeButton } from "./revoke-button";

interface InviteListProps {
  invites: Invite[];
}

export function InviteList({ invites }: InviteListProps) {
  if (invites.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        {EMPTY_STATES.invites_for_trip}
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-border">
      {invites.map((invite) => (
        <InviteRow key={invite.token} invite={invite} />
      ))}
    </ul>
  );
}

function InviteRow({ invite }: { invite: Invite }) {
  const usesLine =
    invite.uses_left !== null
      ? M3_UI_STRINGS.invitesPage_uses_template.replace(
          "{remaining}",
          String(invite.uses_left),
        )
      : null;

  const expiryLine =
    invite.expires_at !== null
      ? M3_UI_STRINGS.invitesPage_expires_template.replace(
          "{when}",
          format(new Date(invite.expires_at), "MMM d, yyyy"),
        )
      : null;

  return (
    <li className="py-3 flex flex-col gap-2">
      {/* Token via the <Identifier> primitive — mono render + copy-on-tap
          (copies the raw token; distinct from CopyLinkButton's URL copy).
          On its own line so it has room to truncate at 375px. */}
      <Identifier value={invite.token} copyable />

      <div className="flex items-center gap-2">
        <CopyLinkButton token={invite.token} />
        <RevokeButton token={invite.token} />
      </div>

      {(usesLine || expiryLine) && (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {usesLine && <span>{usesLine}</span>}
          {expiryLine && <span>{expiryLine}</span>}
        </div>
      )}
    </li>
  );
}
