/**
 * `/invite/[token]` — public invite preview.
 *
 * NOT inside the `(authed)` route group on purpose. Anonymous visitors
 * must see a trip name + dates + host + bucketed attendee count BEFORE
 * deciding whether to sign in. That's the wedge that converts a
 * group-chat link click into a real attendee.
 *
 * Security notes:
 *   - We use an explicitly anonymous Supabase client (not the
 *     cookie-reading server client). The `invite_preview` RPC is
 *     granted to `anon` + `authenticated`, but bypassing the SSR
 *     session entirely keeps any side-channel leaks (cookie-bound
 *     headers, future RLS-injectable headers) off this path.
 *   - The RPC returns a BUCKETED attendee count. The raw integer
 *     would let a single-use invite act as an enumeration oracle.
 *   - Errors collapse to the same "can't find that invite" outcome
 *     for expired / exhausted / not-found, so a hostile prober can't
 *     distinguish "this token never existed" from "this token was
 *     used."
 */

import Link from "next/link";
import { format } from "date-fns";
import { createClient as createAnonClient } from "@supabase/supabase-js";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import {
  ATTENDEE_COUNT_BUCKET_LABELS,
  M2_UI_STRINGS,
} from "@/lib/copy/empty-states";
import { getInvitePreview } from "@/lib/db/invites";
import { createClient as createServerClient } from "@/lib/supabase/server";
import type { InvitePreview } from "@/lib/db/types";

type PageProps = {
  params: Promise<{ token: string }>;
  // Next 16 — `searchParams` is also a Promise.
  searchParams: Promise<{ error?: string }>;
};

/**
 * Narrow the `?error=` query value to a known ErrorKey before indexing
 * the ERRORS palette. Anything outside the known surface is dropped —
 * an attacker can't seed an arbitrary string into the rendered output.
 *
 * Only the keys actually emitted by `/invite/[token]/accept` are
 * accepted: `invite_not_found` (collapsed from expired/exhausted/
 * not-found per anti-enumeration), `auth_failed`, `rate_limit`,
 * `network`. Anything else returns null and we render no error band.
 */
const RENDERABLE_INVITE_ERRORS = new Set<ErrorKey>([
  "invite_not_found",
  "auth_failed",
  "rate_limit",
  "network",
]);

function narrowInviteErrorKey(raw: string | undefined): ErrorKey | null {
  if (!raw) return null;
  return RENDERABLE_INVITE_ERRORS.has(raw as ErrorKey)
    ? (raw as ErrorKey)
    : null;
}

export default async function InvitePreviewPage({
  params,
  searchParams,
}: PageProps) {
  const { token } = await params;
  const { error: errorKeyRaw } = await searchParams;
  const errorKey = narrowInviteErrorKey(errorKeyRaw);

  // Anonymous client — no cookies, no session. This is the load-bearing
  // detail: we never want the SSR session leaking into a public route.
  const anon = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  let preview: InvitePreview | null = null;
  try {
    preview = await getInvitePreview(anon, token);
  } catch (err) {
    // Log so a real outage surfaces in our logs / Sentry — the user
    // still sees the generic "invite not found" view (anti-enumeration).
    console.error("[invite] getInvitePreview failed:", err);
    preview = null;
  }

  if (!preview) {
    return <InviteMissing />;
  }

  // Separately, ask the server-side (cookie-bound) client whether the
  // viewer is signed in. We use this to decide whether the CTA submits
  // straight to the accept route or bounces through `/login`.
  const sessionClient = await createServerClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();
  const isSignedIn = Boolean(user);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-4 py-10">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl font-medium">{preview.trip_name}</h1>
          </CardTitle>
          <CardDescription>
            {formatPreviewDates(preview)} · with {preview.host_display_name}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {/* Error band from a previous /accept attempt. Renders only
              for keys that can actually originate from that path; all
              user-visible distinctions between expired / exhausted /
              not-found collapse to a single `invite_not_found` string
              upstream (anti-enumeration). */}
          {errorKey ? (
            <p
              role="alert"
              className="text-destructive border-destructive/30 rounded-md border p-2 text-sm"
            >
              {ERRORS[errorKey]}
            </p>
          ) : null}
          <p className="text-muted-foreground text-sm">
            {ATTENDEE_COUNT_BUCKET_LABELS[preview.attendee_count_bucket]}
          </p>
          {isSignedIn ? (
            // Authenticated viewer — submit the accept handler directly.
            // The POST route does the actual mutation and redirects.
            <form action={`/invite/${token}/accept`} method="post">
              <Button type="submit" size="lg" className="w-full">
                {M2_UI_STRINGS.invitePreview_cta_authed}
              </Button>
            </form>
          ) : (
            <Link
              href={`/login?next=/invite/${token}/accept`}
              className={buttonVariants({ size: "lg", className: "w-full" })}
            >
              {M2_UI_STRINGS.invitePreview_cta_anon}
            </Link>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

/**
 * Shared "this invite isn't valid" view. We collapse not-found /
 * expired / exhausted to a single string so we don't telegraph which
 * specific failure happened (anti-enumeration).
 */
function InviteMissing() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-4 py-10 text-center">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl font-medium">{ERRORS.invite_not_found}</h1>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            {M2_UI_STRINGS.invitePreview_back_link}
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}

function formatPreviewDates(preview: InvitePreview): string {
  if (preview.starts_at && preview.ends_at) {
    return `${format(new Date(preview.starts_at), "MMM d")} – ${format(
      new Date(preview.ends_at),
      "MMM d"
    )}`;
  }
  if (preview.starts_at) {
    return format(new Date(preview.starts_at), "MMM d");
  }
  return M2_UI_STRINGS.invitePreview_dates_unset;
}
