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

import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getTripBySlug } from "@/lib/db/trips";
import { getViewerMember } from "@/lib/db/trips";
import { signOut } from "@/lib/actions/auth";
import { M4_UI_STRINGS } from "@/lib/copy/empty-states";

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

  const displayName = member.display_name ?? user.email ?? M4_UI_STRINGS.me_display_name_fallback;
  const email = user.email ?? "";

  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {M4_UI_STRINGS.me_page_heading}
        </h1>
      </header>

      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <dl className="flex flex-col gap-3">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {M4_UI_STRINGS.me_label_name}
              </dt>
              <dd className="mt-0.5 text-sm text-foreground">{displayName}</dd>
            </div>
            {email ? (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {M4_UI_STRINGS.me_label_email}
                </dt>
                <dd className="mt-0.5 text-sm text-foreground">{email}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <form action={signOut}>
          <button
            type="submit"
            className="focus-visible:ring-ring w-full rounded-full border border-border bg-muted px-5 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            {M4_UI_STRINGS.me_sign_out_cta}
          </button>
        </form>
      </div>
    </section>
  );
}
