import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safe-next";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // safeNext() collapses `null`, protocol-relative (`//evil.com/x`),
  // off-origin (`https://evil.com`), and scheme-prefixed
  // (`javascript:alert(1)`) inputs to the default `/trips` target. See
  // `lib/auth/safe-next.ts` for the threat model.
  const next = safeNext(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
