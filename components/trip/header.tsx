import * as React from "react";

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { HeaderMenu } from "@/components/trip/header-menu";

/**
 * Shape we accept from `supabase.auth.getUser()`. We don't depend on
 * the full `User` type from `@supabase/supabase-js` here so the Header
 * is testable without spinning up that whole type surface — only the
 * fields we actually read are typed.
 *
 * `email` is required because the avatar fallback derives an initial
 * from it. If we ever support phone-only sign-in, swap to `display_name`.
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
  const initial = deriveInitial(user.email);

  return (
    <header className="border-border/60 bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30 border-b backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <span className="text-base font-semibold tracking-tight">
          Party Trip
        </span>
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
 * Pull the first alpha character out of an email and uppercase it.
 * Falls back to "?" when we have no usable identifier — keeps the
 * fallback slot from collapsing.
 */
function deriveInitial(email: string | null | undefined): string {
  if (!email) return "?";
  const match = email.match(/[a-zA-Z]/);
  return (match?.[0] ?? "?").toUpperCase();
}
