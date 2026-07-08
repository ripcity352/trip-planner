/**
 * `POST /invite/[token]/accept` — Route Handler that accepts an invite.
 *
 * Why a Route Handler and not a Server Action: the public preview page
 * submits a real `<form action="..." method="post">` (no JS required),
 * which means the entry point has to be an HTTP endpoint, not a server
 * action wired to a client component. Anonymous visitors who landed on
 * the preview without JS can still complete the flow.
 *
 * Only POST is exported. The GET handler was removed in W0c (M4, #106):
 * keeping GET open is a CSRF surface — a crafted link could trigger
 * acceptance without user intent.
 *
 * Because of that, this route is NEVER a redirect / `next=` target: a
 * post-sign-in redirect is a GET, and a GET here lands a 405 blank page
 * (#316). The not-authed bounce below sends the user to the GET-navigable
 * preview page (`invitePreviewPath`); once signed in, the preview renders
 * the one-tap Accept POST form.
 *
 * Idempotency: we derive the idempotency key DETERMINISTICALLY from
 * `(userId, token)` — both fixed strings the server can read at call
 * time. That means two POSTs from the same user with the same token
 * produce the same key, and the DB-side partial unique on
 * `trip_members (trip_id, idempotency_key)` short-circuits the second
 * insert.
 */

import { NextResponse, type NextRequest } from "next/server";
import crypto from "node:crypto";

import { acceptInviteAction } from "@/lib/actions/invites";
import { invitePreviewPath } from "@/lib/invites/paths";
import { createClient } from "@/lib/supabase/server";

/**
 * Deterministic uuid derived from `(userId, token)`. We hash via SHA-256
 * (Node's built-in), grab the first 16 bytes, and reshape into a v5-
 * style uuid (`xxxxxxxx-xxxx-5xxx-yxxx-xxxxxxxxxxxx`). Same inputs →
 * same output, no need to persist anything client-side. We do NOT use
 * the standard uuid v5 algorithm because pulling the `uuid` package
 * just for one helper isn't worth a new dep.
 */
function deterministicIdempotencyKey(userId: string, token: string): string {
  const hash = crypto
    .createHash("sha256")
    .update(`${userId}::${token}`)
    .digest("hex");
  // Pull out 32 hex chars and format as uuid.
  const hex = hash.slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function handle(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  const { token } = await params;

  // #348: the accept form may carry an optional display name. The form
  // posts application/x-www-form-urlencoded (no-JS path included);
  // formData() failure just means "no name" — never block the accept.
  let displayName: string | null = null;
  try {
    const form = await request.formData();
    const raw = form.get("display_name");
    if (typeof raw === "string") displayName = raw;
  } catch {
    displayName = null;
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    // Bounce through login. `next` must be GET-navigable — the preview
    // page, NOT this POST-only route (#316). After sign-in the preview
    // renders the one-tap Accept POST form.
    const url = new URL(request.nextUrl.origin);
    url.pathname = "/login";
    url.searchParams.set("next", invitePreviewPath(token));
    return NextResponse.redirect(url, { status: 303 });
  }

  const idempotencyKey = deterministicIdempotencyKey(authData.user.id, token);

  // The action calls `redirect()` on success — Next.js converts that
  // into a thrown NEXT_REDIRECT digest that the framework catches at
  // the route boundary and turns into a 30x. We let it propagate.
  // On failure, we map the errorKey to a query string so `/invite/[token]`
  // (which doesn't currently render errors) at least lands the user
  // somewhere they can read the toast.
  const result = await acceptInviteAction(token, idempotencyKey, displayName);

  // `acceptInviteAction` throws NEXT_REDIRECT on success; if we get
  // here, it returned an error envelope.
  if (result && !result.ok) {
    const errorUrl = new URL(`/invite/${token}`, request.nextUrl.origin);
    errorUrl.searchParams.set("error", result.errorKey);
    return NextResponse.redirect(errorUrl, { status: 303 });
  }

  // Defensive: should never reach this branch.
  return NextResponse.redirect(new URL("/", request.nextUrl.origin));
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ token: string }> }
): Promise<NextResponse> {
  return handle(request, ctx);
}

// GET intentionally removed — W0c (M4, #106).
// See module-level comment for rationale.
