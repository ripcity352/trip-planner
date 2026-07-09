/**
 * InviteList — server-friendly list of active invite links.
 *
 * Each row shows: token (via the <Identifier> primitive — mono, truncated,
 * display-only), uses remaining, expiry, a copy-link button (client), and a
 * revoke button (client — calls revokeInviteAction).
 *
 * Server Component: the list itself is static. CopyLinkButton (clipboard)
 * and RevokeButton (confirmation step) are the client leaves; <Identifier>
 * here is display-only. The raw token alone is not actionable (you need the
 * full join URL), so copying is left to CopyLinkButton — no second copy
 * affordance per row.
 *
 * Strings sourced from M3_UI_STRINGS / ERRORS per Override F.
 */

import { format } from "date-fns";

import { Identifier } from "@/components/ui/identifier";
import { EMPTY_STATES, M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { isInviteDead } from "@/lib/db/invites";
import type { Invite } from "@/lib/db/types";
import { cn } from "@/lib/utils";
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

  // #385: dead-state computed ONCE per render with a single clock. This is
  // a Server Component (no client boundary above it), so this is the
  // server's clock at request time — no SSR/client hydration drift.
  const now = new Date();

  return (
    <ul className="flex flex-col divide-y divide-border">
      {invites.map((invite) => (
        <InviteRow
          key={invite.token}
          invite={invite}
          isDead={isInviteDead(invite, now)}
        />
      ))}
    </ul>
  );
}

function InviteRow({ invite, isDead }: { invite: Invite; isDead: boolean }) {
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
    <li className={cn("py-3 flex flex-col gap-2", isDead && "opacity-60")}>
      {/* Token via the <Identifier> primitive — display-only mono render.
          On its own line so it has room to truncate at 375px. Copying is
          CopyLinkButton's job (the full join URL); the raw token isn't
          actionable on its own. */}
      <Identifier value={invite.token} />

      {/* #385: a dead link (revoked / expired / used up) must not look
          live — no Copy link (Dave would paste it in the group chat), no
          Revoke (nothing left to revoke). The row stays visible as an
          audit trail; the uses/expiry meta below explains why it died. */}
      {isDead ? (
        <p className="text-sm text-muted-foreground">
          {M3_UI_STRINGS.invitesPage_dead_label}
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <CopyLinkButton token={invite.token} />
          <RevokeButton token={invite.token} />
        </div>
      )}

      {(usesLine || expiryLine) && (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          {usesLine && <span>{usesLine}</span>}
          {expiryLine && <span>{expiryLine}</span>}
        </div>
      )}
    </li>
  );
}
