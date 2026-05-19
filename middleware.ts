import { updateSession } from "@/lib/supabase/middleware";
import { rateLimitRequest } from "@/lib/rate-limit";
import { type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Rate-limit mutation-like requests before doing any session work.
  // `rateLimitRequest` returns a 429 NextResponse when the caller is over
  // budget, or `null` to pass through.
  const limited = await rateLimitRequest(request);
  if (limited) return limited;

  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
