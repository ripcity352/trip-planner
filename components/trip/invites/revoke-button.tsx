"use client";

/**
 * RevokeButton — confirms + executes revokeInviteAction for an invite.
 *
 * Uses window.confirm for the confirmation step — the simplest pattern
 * that meets the "drunk user on bad signal" safety bar. No modal deps.
 *
 * Strings sourced from M3_UI_STRINGS / ERRORS per Override F.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ERROR_LINE_CLASS } from "@/lib/ui/error-surface";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS } from "@/lib/copy/errors";
import { revokeInviteAction } from "@/lib/actions/invites";

interface RevokeButtonProps {
  token: string;
  onRevoked?: () => void;
}

export function RevokeButton({ token, onRevoked }: RevokeButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revoked, setRevoked] = useState(false);

  async function handleRevoke() {
    if (!window.confirm(M3_UI_STRINGS.invitesPage_revoke_confirm)) return;

    setRevoking(true);
    setError(null);

    const result = await revokeInviteAction(token);

    setRevoking(false);

    if (!result.ok) {
      setError(ERRORS[result.errorKey] ?? ERRORS.network);
      return;
    }

    setRevoked(true);
    onRevoked?.();
  }

  if (revoked) return null;

  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleRevoke}
        disabled={revoking}
        className="h-11 text-destructive hover:text-destructive"
      >
        {M3_UI_STRINGS.invitesPage_revoke_cta}
      </Button>
      {error && (
        <p role="alert" className={cn(ERROR_LINE_CLASS, "text-xs mt-1")}>
          {error}
        </p>
      )}
    </div>
  );
}
