/**
 * middleware.ts
 *
 * Two responsibilities:
 *   1. Rate-limit mutation requests (pre-existing).
 *   2. Deep-link preservation (#104): when an unauthenticated user hits an
 *      authed-only route, redirect to `/login?next=<original-url>` so they
 *      land back at the intended page after signing in.
 *
 * The `?next` param is consumed by `/auth/callback`, which calls `safeNext()`
 * (from M2) to validate and sanitise the target before redirecting. `safeNext`
 * rejects protocol-relative (`//evil.com`), absolute external, and scheme-
 * prefixed (`javascript:`) inputs — open-redirect safety is upstream of this
 * file.
 *
 * Auth check strategy: we call `supabase.auth.getUser()` (not `getSession()`)
 * because `getUser()` validates the JWT against Supabase's auth server. The
 * tradeoff is a network round-trip on every authed-route middleware call; the
 * session cookie itself is not sufficient for security-critical decisions.
 *
 * Authed routes are identified by the `/trips` prefix (everything under the
 * `(authed)` route group). The `/login` and `/auth` routes are explicitly
 * excluded so the redirect loop can't occur.
 */

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { rateLimitRequest } from "@/lib/rate-limit";

/** URL prefixes that require an authenticated session. */
const AUTHED_PREFIXES = ["/trips"] as const;

/** URL prefixes that must never be redirected (auth + public). */
const PUBLIC_PREFIXES = ["/login", "/auth", "/_next", "/favicon"] as const;

function isAuthedRoute(pathname: string): boolean {
  return AUTHED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request: NextRequest) {
  // Rate-limit mutation-like requests before doing any session work.
  // `rateLimitRequest` returns a 429 NextResponse when the caller is over
  // budget, or `null` to pass through.
  const limited = await rateLimitRequest(request);
  if (limited) return limited;

  const { pathname } = request.nextUrl;

  // Only check auth on routes that require it. Skip public routes entirely.
  if (isAuthedRoute(pathname) && !isPublicRoute(pathname)) {
    // Build a minimal Supabase client to check the session. Cookie mutations
    // must be propagated via a NextResponse (same pattern as updateSession).
    let response = NextResponse.next({ request });

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      // Preserve the deep-link target. Include search params so e.g.
      // `/trips/my-trip?tab=crew` round-trips correctly.
      const next = encodeURIComponent(
        pathname + request.nextUrl.search
      );
      const loginUrl = new URL(`/login?next=${next}`, request.url);
      return NextResponse.redirect(loginUrl);
    }

    return response;
  }

  // For all other routes: refresh session cookies without a redirect.
  // Import inline to avoid re-importing the Supabase client above for
  // non-authed routes.
  const { updateSession } = await import("@/lib/supabase/middleware");
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
