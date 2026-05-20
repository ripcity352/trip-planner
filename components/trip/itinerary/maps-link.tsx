"use client";

/**
 * MapsLink — shows Apple Maps + Google Maps links for an address.
 *
 * Both links are always visible. We do not auto-detect the platform
 * and hide one — the user might want to open either, and hiding one
 * creates a false default.
 *
 * Links open in a new tab (target=_blank) to avoid breaking the user's
 * current view. rel="noopener noreferrer" is mandatory for security.
 *
 * No new dependencies — uses lib/utils/maps-deep-link.ts (pure URL builder).
 */

import { buildMapsDeepLinks } from "@/lib/utils/maps-deep-link";
import { cn } from "@/lib/utils";

export interface MapsLinkProps {
  address: string;
  className?: string;
}

export function MapsLink({ address, className }: MapsLinkProps) {
  const { apple, google } = buildMapsDeepLinks(address);

  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-sm", className)}>
      <a
        href={apple}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline-offset-2 hover:underline"
        aria-label={`Open "${address}" in Apple Maps`}
      >
        Apple Maps
      </a>
      <span aria-hidden className="text-muted-foreground">
        ·
      </span>
      <a
        href={google}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline-offset-2 hover:underline"
        aria-label={`Open "${address}" in Google Maps`}
      >
        Google Maps
      </a>
    </div>
  );
}
