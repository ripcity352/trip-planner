/**
 * Deep-link preservation across the login bounce lives primarily in
 * `middleware.ts` (#104) — it redirects unauthenticated hits to
 * `/login?next=<path>` before this layout ever renders. The guard below
 * is defense-in-depth for the rare case where middleware saw a session
 * but `getUser()` here doesn't (revoked mid-flight); it preserves the
 * same context by reading the `x-pathname` header middleware stamps on
 * every authed-route request (#433). safeNext() re-validates the value,
 * so a spoofed header can never steer the redirect off-origin or onto a
 * POST-only path.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Header } from "@/components/trip/header";
import { DEFAULT_NEXT, safeNext } from "@/lib/auth/safe-next";
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
    // #433: keep parity with the middleware gate — both bounces carry
    // `next`. When the header is missing/unsafe, safeNext falls back to
    // DEFAULT_NEXT and we keep the bare /login (its form already defaults
    // to /trips after sign-in).
    const requestPath = safeNext((await headers()).get("x-pathname"));
    redirect(
      requestPath === DEFAULT_NEXT
        ? "/login"
        : `/login?next=${encodeURIComponent(requestPath)}`,
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Header user={user} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
