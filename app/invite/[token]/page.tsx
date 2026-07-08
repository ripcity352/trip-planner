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
 *
 * Anti-pattern guard (auth-execution-plan.md §#219 / CLAUDE.md hard-banned):
 *   ZERO completion-count, RSVP-speed, leaderboard, progress-bar, or
 *   "X of N going / responded" affordance. A bucketed count is fine;
 *   a bar, score, or ordering is banned. The invite is not a project
 *   with a done state.
 */

import Link from "next/link";
import { format } from "date-fns";
import { createClient as createAnonClient } from "@supabase/supabase-js";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ERRORS, type ErrorKey } from "@/lib/copy/errors";
import {
  ATTENDEE_COUNT_BUCKET_LABELS,
  M2_UI_STRINGS,
} from "@/lib/copy/empty-states";
import {
  ERROR_SURFACE_CLASS,
  ERROR_SURFACE_BORDER_STYLE,
} from "@/lib/ui/error-surface";
import { cn } from "@/lib/utils";
import { getInvitePreview } from "@/lib/db/invites";
import { invitePreviewPath, inviteAcceptPath } from "@/lib/invites/paths";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { parseDateOnly } from "@/lib/utils/date-only";
import type { InvitePreview } from "@/lib/db/types";
import { LoginForm } from "@/app/login/_form";
import { getProfile } from "@/lib/db/profiles";
import { buildInviteH1 } from "@/lib/og/invite-card";

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

  // #348: prefill the accept-form name input from the durable profile
  // name when one exists (RLS: own-profile read).
  let viewerDisplayName: string | null = null;
  if (user) {
    try {
      const profile = await getProfile(sessionClient, user.id);
      viewerDisplayName = profile?.display_name ?? null;
    } catch {
      viewerDisplayName = null;
    }
  }

  // The H1 hook: "{Host} wants you on this one." — sourced from W0 D1 keys.
  // buildInviteH1 sanitizes, clamps, and falls back to inviteH1Fallback.
  const h1Text = buildInviteH1(preview.host_display_name);
  const dateText = formatPreviewDates(preview);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center px-4 py-10">
      {/* Magazine hero card */}
      <article className="w-full overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm">
        {/* Warm editorial hook — the "magazine" treatment */}
        <header className="px-6 pb-4 pt-6">
          <h1 className="text-2xl font-semibold leading-tight tracking-tight">
            {h1Text}
          </h1>
        </header>

        {/* Trip identity block */}
        <div className="px-6 pb-4">
          <p className="text-lg font-medium">{preview.trip_name}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{dateText}</p>
          {/* Bucketed count — plain aggregate, no bar / score / ordering */}
          <p className="mt-3 text-sm text-muted-foreground">
            {ATTENDEE_COUNT_BUCKET_LABELS[preview.attendee_count_bucket]}
          </p>
        </div>

        {/* Divider */}
        <div className="mx-6 border-t border-border" />

        {/* CTA block */}
        <div className="px-6 pb-6 pt-4">
          {/* Error band from a previous /accept attempt. Renders only
              for keys that can actually originate from that path; all
              user-visible distinctions between expired / exhausted /
              not-found collapse to a single `invite_not_found` string
              upstream (anti-enumeration). */}
          {errorKey ? (
            <p
              role="alert"
              className={cn(ERROR_SURFACE_CLASS, "mb-3 p-2 text-sm")}
              style={ERROR_SURFACE_BORDER_STYLE}
            >
              {ERRORS[errorKey]}
            </p>
          ) : null}

          {isSignedIn ? (
            // Authenticated viewer — submit the accept handler directly.
            // The POST route does the actual mutation and redirects.
            // #348: optional display name so the roster shows a person,
            // not "Guest". Prefilled from the profile when one exists;
            // never required (rule 8 — no uniform-attendee assumptions,
            // no asterisks).
            <form
              action={inviteAcceptPath(token)}
              method="post"
              className="flex flex-col gap-3"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-display-name">
                  {M2_UI_STRINGS.invitePreview_name_label}
                </Label>
                <Input
                  id="invite-display-name"
                  name="display_name"
                  type="text"
                  maxLength={80}
                  autoComplete="name"
                  defaultValue={viewerDisplayName ?? undefined}
                  placeholder={M2_UI_STRINGS.invitePreview_name_placeholder}
                />
              </div>
              <Button type="submit" size="lg" className="w-full">
                {M2_UI_STRINGS.invitePreview_cta_authed}
              </Button>
            </form>
          ) : (
            // Anonymous viewer — render the LoginForm inline so they
            // never leave the invite page. On successful sign-in the form
            // redirects (GET) back to THIS preview, which then renders the
            // one-tap Accept POST form above. `next` must be the preview,
            // never the POST-only accept route (#316).
            // M5/PR2: replaces the old /login?next= bounce link.
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">
                {M2_UI_STRINGS.invitePreview_cta_anon}
              </p>
              <LoginForm next={invitePreviewPath(token)} />
            </div>
          )}
        </div>
      </article>
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
      <article className="w-full overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm">
        <header className="px-6 py-6">
          <h1 className="text-xl font-medium">{ERRORS.invite_not_found}</h1>
        </header>
        <div className="px-6 pb-6">
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            {M2_UI_STRINGS.invitePreview_back_link}
          </Link>
        </div>
      </article>
    </main>
  );
}

function formatPreviewDates(preview: InvitePreview): string {
  if (preview.starts_at && preview.ends_at) {
    return `${format(parseDateOnly(preview.starts_at), "MMM d")} – ${format(
      parseDateOnly(preview.ends_at),
      "MMM d"
    )}`;
  }
  if (preview.starts_at) {
    return format(parseDateOnly(preview.starts_at), "MMM d");
  }
  // Dates not yet set — show the "Dates TBD" affordance (behavior preserved
  // from the pre-magazine layout; an undecided-dates invite still tells the
  // reader dates are coming rather than silently dropping the line).
  return M2_UI_STRINGS.invitePreview_dates_unset;
}
