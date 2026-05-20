/**
 * InviteList — server-friendly list of active invite links.
 *
 * Each row shows: token (truncated), uses remaining, expiry, a copy-link
 * button (client), and a revoke button (client — calls revokeInviteAction).
 *
 * Server Component: the list itself is static. CopyLinkButton is the only
 * client leaf (needs clipboard API). The revoke button is also a client
 * component because it needs a confirmation step.
 *
 * Strings sourced from M3_UI_STRINGS / ERRORS per Override F.
 */

import { format } from "date-fns";

import { EMPTY_STATES } from "@/lib/copy/empty-states";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
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
      ? M3_UI_STRINGS.invitesPage_uses_template
          .replace("{remaining}", String(invite.uses_left))
          .replace("{total}", String(invite.uses_left))
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
      <div className="flex items-center justify-between gap-2">
        {/* Token display — truncated for mobile readability */}
        <code className="text-xs text-muted-foreground truncate max-w-[120px]">
          {invite.token}
        </code>

        <div className="flex items-center gap-2 shrink-0">
          <CopyLinkButton token={invite.token} />
          <RevokeButton token={invite.token} />
        </div>
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
