/**
 * Deep-link preservation across the login bounce is intentionally NOT
 * implemented here. Moving it to `middleware.ts` / `proxy.ts` (where
 * `request.nextUrl.pathname` is authoritative) is the correct place;
 * deferred to a follow-up PR. The simple redirect keeps the auth gate
 * honest in the meantime.
 *
 * Tracked in: https://github.com/ripcity352/trip-planner/issues/104
 */
import { redirect } from "next/navigation";

import { Header } from "@/components/trip/header";
import { createClient } from "@/lib/supabase/server";

/**
 * Layout for the authenticated surface — `/trips`, `/trips/<slug>`,
 * and everything beneath. The `(authed)` segment is a route group: it
 * groups files without affecting URLs, so children stay at `/trips`,
 * `/trips/[tripId]`, etc.
 *
 * Auth gate: we call `supabase.auth.getUser()` (NOT `getSession()` —
 * `getUser()` validates the JWT against Supabase, which is required for
 * security-critical decisions like rendering authenticated UI) and
 * redirect to `/login` if there's no user.
 */
export default async function AuthedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Header user={user} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
