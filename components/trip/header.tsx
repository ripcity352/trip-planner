import * as React from "react";

import Link from "next/link";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { HeaderMenu } from "@/components/trip/header-menu";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

/**
 * Shape we accept from `supabase.auth.getUser()`. We don't depend on
 * the full `User` type from `@supabase/supabase-js` here so the Header
 * is testable without spinning up that whole type surface — only the
 * fields we actually read are typed.
 *
 * The avatar fallback initial derives from the resolved display name
 * first (`user_metadata.display_name`), with `email` only as a last
 * resort — the #215/#216 identity precedence (display name over email),
 * applied to the auth user the authed root layout has on hand (there's no
 * trip-scoped member map at this layer). Before #405-A a walk persona who
 * typed "Nate Newguy" was crowned "W" from `walk-…@example.com`.
 */
export interface HeaderUser {
  email?: string | null;
  user_metadata?: {
    avatar_url?: string | null;
    display_name?: string | null;
  } | null;
}

/**
 * Authenticated top bar. Server Component — renders on every authed
 * route via `app/(authed)/layout.tsx`. Mobile-first: brand left,
 * avatar+menu right, no nav rail (the trip dashboard owns its own
 * navigation surface).
 */
export function Header({ user }: { user: HeaderUser }) {
  const avatarUrl = user.user_metadata?.avatar_url ?? null;
  const initial = deriveInitial(user.user_metadata?.display_name, user.email);

  return (
    <header className="border-border/60 bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link
          href="/trips"
          aria-label={M3_UI_STRINGS.nav_brand_label}
          className="text-base font-semibold tracking-tight"
        >
          {M3_UI_STRINGS.nav_brand_label}
        </Link>
        <HeaderMenu>
          <Avatar size="default">
            {avatarUrl ? (
              <AvatarImage
                src={avatarUrl}
                // Empty alt — the parent trigger carries the
                // accessible label "Account menu". An avatar image
                // duplicated into alt text would just be noise to AT.
                alt=""
                data-testid="header-avatar-image"
              />
            ) : null}
            <AvatarFallback data-testid="header-avatar-fallback">
              {initial}
            </AvatarFallback>
          </Avatar>
        </HeaderMenu>
      </div>
    </header>
  );
}

/**
 * Pull the first alpha character out of the resolved identity and
 * uppercase it. Precedence: display name first, email as last resort
 * (#405-A / #215-#216). Falls back to "?" when neither yields an alpha
 * char — keeps the fallback slot from collapsing.
 *
 * Note: this is NOT email-local-part display derivation (the #216 ban) —
 * we take a single initial from whichever identity resolves, never a
 * name from the local part.
 */
function deriveInitial(
  displayName: string | null | undefined,
  email: string | null | undefined,
): string {
  const source = displayName?.trim() || email || "";
  const match = source.match(/[a-zA-Z]/);
  return (match?.[0] ?? "?").toUpperCase();
}
