"use client";

import * as React from "react";

import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/actions/auth";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { AUTH_COPY } from "@/lib/copy/auth";

/**
 * Tiny client wrapper around the avatar — only the parts that need
 * client state (menu open/close, form-action wiring) live here. The
 * Avatar visual and brand text stay in the parent Server Component so
 * SSR ships a complete header before hydration.
 *
 * The "Sign out" item is rendered as a `<form action={signOut}>` so the
 * server action runs on submit without a client-side fetch. We trigger
 * `form.requestSubmit()` from the menu item's `onClick` because base-ui
 * Menu items aren't real buttons inside a form.
 */
export function HeaderMenu({ children }: { children: React.ReactNode }) {
  const formRef = React.useRef<HTMLFormElement>(null);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        // The Avatar lives behind the trigger; aria-label keeps the
        // button discoverable for keyboard / screen-reader users.
        aria-label="Account menu"
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {children}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-40">
        {/* Navigation items — above sign-out */}
        <DropdownMenuItem>
          <Link href="/trips" className="w-full">
            {M3_UI_STRINGS.nav_account_trips_link}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Link href="/account/sign-in-and-security" className="w-full">
            {AUTH_COPY.accountSecurity_meNavLink}
          </Link>
        </DropdownMenuItem>

        <form ref={formRef} action={signOut} className="contents">
          <DropdownMenuItem
            // Native menu item -> manually submit the wrapping form so
            // the server action fires. Keeps progressive enhancement
            // intact: if JS fails, the form still works because the
            // submit button below stays in the DOM.
            onClick={() => formRef.current?.requestSubmit()}
            // Treat sign-out as destructive in voice + visual.
            variant="destructive"
          >
            Sign out
          </DropdownMenuItem>
          {/*
            Hidden no-JS fallback: pressing Enter on the menu item still
            submits because the form is in the document. Keeping this
            here also gives Playwright a clean handle if we ever need
            to assert the form's action target.
          */}
          <button type="submit" className="sr-only" tabIndex={-1}>
            Sign out
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
