import { redirect } from "next/navigation";
import { headers } from "next/headers";

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
 * redirect to `/login` if there's no user. We pass the current path
 * back via `?next=` so the magic-link callback can bounce the user to
 * where they were headed.
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
    const nextPath = await getRequestPath();
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Header user={user} />
      <main className="flex-1">{children}</main>
    </div>
  );
}

/**
 * Recover the request path from headers Next.js sets on every request.
 * `x-invoke-path` is the documented internal header for routing; we
 * fall back to parsing the standard `referer`-style `next-url` header
 * (set by App Router's RSC requests) and finally to `/trips` so the
 * redirect target is always sane.
 *
 * Kept inline rather than extracted to `lib/utils/` because it's a
 * one-call helper and depends on Next runtime — extracting it would
 * pull `next/headers` into a utility that doesn't need it elsewhere.
 */
async function getRequestPath(): Promise<string> {
  const headerList = await headers();
  const invokePath = headerList.get("x-invoke-path");
  if (invokePath) return invokePath;

  const nextUrl = headerList.get("next-url");
  if (nextUrl) return nextUrl;

  // Default landing for an unauthenticated hit on the authed surface.
  return "/trips";
}
