/**
 * `/invite/[token]` — OG image route.
 *
 * Renders a 1200×630 social card so that pasting an invite link into a
 * group chat (iMessage, WhatsApp, Slack, Discord, etc.) produces a
 * recognisable preview rather than a bare URL.
 *
 * Security contract (#219 OG / auth-execution-plan.md §D3):
 *   - Inputs sourced ONLY from the bucketed anon `invite_preview` RPC.
 *     NEVER from request headers, search params, or any user-controlled
 *     surface. This prevents OG-text injection via Link Unfurling.
 *   - `sanitizeTripName` / `sanitizeHost` / `buildOgCardText` strip
 *     control chars (including CR/LF/U+2028/U+2029), collapse whitespace,
 *     and clamp to safe lengths. Pure helpers live in `lib/og/invite-card.ts`
 *     so they can be unit-tested independently of this route.
 *   - `buildOgCardText` returns `OG_CARD_FALLBACK` ("You're invited.") when
 *     the RPC errors OR a required field is null/empty — the card never
 *     crashes, never leaks.
 *   - Anonymous Supabase client with `persistSession: false`. No cookies,
 *     no session, no SSR side-channels.
 */

import { ImageResponse } from "next/og";
import { createClient as createAnonClient } from "@supabase/supabase-js";

import { getInvitePreview } from "@/lib/db/invites";
import {
  buildOgCardText,
  formatOgDates,
  sanitizeTripName,
  OG_CARD_FALLBACK,
} from "@/lib/og/invite-card";

// Standard OG size — 1200×630 is the most widely supported.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type Props = {
  params: Promise<{ token: string }>;
};

export default async function OgImage({ params }: Props) {
  const { token } = await params;

  // Anonymous client — no cookies, no session, no request headers.
  // This matches the security model of the invite preview page exactly.
  const anon = createAnonClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );

  // Attempt to fetch the preview. Any error (RPC down, token invalid,
  // network timeout) produces the generic fallback card — never a crash.
  let cardText = OG_CARD_FALLBACK;
  let tripDisplay = "";

  try {
    const preview = await getInvitePreview(anon, token);

    if (preview) {
      const tripName = sanitizeTripName(preview.trip_name);
      const dates = formatOgDates(preview.starts_at, preview.ends_at);
      // buildOgCardText falls back to OG_CARD_FALLBACK if tripName or
      // dates are null/empty — never renders a partial string.
      cardText = buildOgCardText({ tripName, dates });
      tripDisplay = tripName;
    }
  } catch {
    // RPC error — generic fallback card. No crash, no leak.
    // Log level: debug — this path fires for expired/invalid tokens too.
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "flex-end",
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 60%, #0f3460 100%)",
          padding: "60px 72px",
        }}
      >
        {/* Eyebrow label */}
        <div
          style={{
            fontSize: 22,
            fontWeight: 500,
            color: "rgba(255,255,255,0.55)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 20,
            display: "flex",
          }}
        >
          Party Trip
        </div>

        {/* Main card text — the interpolated OG string */}
        <div
          style={{
            fontSize: tripDisplay ? 52 : 64,
            fontWeight: 700,
            color: "#ffffff",
            lineHeight: 1.15,
            maxWidth: 900,
            display: "flex",
          }}
        >
          {cardText}
        </div>

        {/* Subtle bottom rule */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 6,
            background: "linear-gradient(90deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%)",
            display: "flex",
          }}
        />
      </div>
    ),
    {
      ...size,
    }
  );
}
