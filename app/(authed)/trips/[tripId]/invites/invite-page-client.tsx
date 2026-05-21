"use client";

/**
 * InvitePageClient — thin client shell for the invite issuance page.
 *
 * Holds the "Mint a link" CTA toggle + the CreateInviteForm. On successful
 * mint it calls `router.refresh()` so the Server Component re-fetches the
 * invite list with the newly created invite included.
 *
 * Kept thin: no state beyond form-visible toggle and the refresh call.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { CreateInviteForm } from "@/components/trip/invites/create-invite-form";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import type { Invite } from "@/lib/db/types";

interface InvitePageClientProps {
  tripId: string;
}

export function InvitePageClient({ tripId }: InvitePageClientProps) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);

  function handleCreated(_createdInvite: Invite) {
    setShowForm(false);
    // Re-fetch the server component so the new invite appears in the list.
    router.refresh();
  }

  if (showForm) {
    return (
      <div className="flex flex-col gap-4">
        <CreateInviteForm tripId={tripId} onCreated={handleCreated} />
        <Button
          type="button"
          variant="ghost"
          className="h-11"
          onClick={() => setShowForm(false)}
        >
          {M3_UI_STRINGS.invitesForm_cancel}
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      className="h-11"
      onClick={() => setShowForm(true)}
    >
      {M3_UI_STRINGS.invitesPage_create_cta}
    </Button>
  );
}
