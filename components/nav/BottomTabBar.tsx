"use client";

/**
 * BottomTabBar — mobile-first bottom navigation for authed trip routes.
 *
 * Renders all 5 tabs for BOTH organizer and celebrant — no role gating.
 * (Voice Audit MEDIUM M2: celebrant must see all tabs.)
 *
 * Active tab inferred from usePathname(). The home tab matches exactly on
 * the trip root; all other tabs match by prefix (so /itinerary/add still
 * lights up the plans tab).
 *
 * Tap targets: each link has min-h-[44px] to meet the 44pt mobile tap
 * comfort zone.
 *
 * Focus ring: focus-visible:ring-2 focus-visible:ring-ring per persimmon
 * focus-ring token convention.
 *
 * Instant tap feedback (#466): `usePathname()` alone only re-colors the
 * tab once the new route has fully committed, which reads as "nothing
 * happened" on a slow connection. `<TabContent>` calls `useLinkStatus()` —
 * the pending state Next.js tracks for its own `<Link>` — so the tapped
 * tab goes primary-colored the instant navigation starts, not when it
 * finishes. Paired with `active:opacity-70` for the immediate touch-down
 * flash and the route's own `loading.tsx` for the content skeleton.
 */

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  CalendarDays,
  MessageSquare,
  Users,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface BottomTabBarProps {
  tripId: string;
}

interface TabDef {
  label: string;
  href: string;
  icon: React.ElementType;
  /** How to determine active state. "exact" = pathname === href; "prefix" = startsWith */
  match: "exact" | "prefix";
}

function buildTabs(tripId: string): TabDef[] {
  return [
    {
      label: "home",
      href: `/trips/${tripId}`,
      icon: Home,
      match: "exact",
    },
    {
      label: "plans",
      href: `/trips/${tripId}/itinerary`,
      icon: CalendarDays,
      match: "prefix",
    },
    {
      label: "updates",
      href: `/trips/${tripId}/announcements`,
      icon: MessageSquare,
      match: "prefix",
    },
    {
      label: "crew",
      href: `/trips/${tripId}/roster`,
      icon: Users,
      match: "prefix",
    },
    {
      label: "me",
      href: `/trips/${tripId}/me`,
      icon: User,
      match: "prefix",
    },
  ];
}

function isTabActive(pathname: string, tab: TabDef): boolean {
  if (tab.match === "exact") {
    // Strip query string for comparison
    return pathname.split("?")[0] === tab.href;
  }
  return pathname.split("?")[0].startsWith(tab.href);
}

/**
 * Rendered as a `<Link>` child so `useLinkStatus()` resolves against the
 * nearest ancestor `<Link>`'s in-flight navigation state. `active` is the
 * committed-route match; `pending` is "this tab was just tapped and the
 * navigation hasn't landed yet" — either one lights the tab up, so the
 * icon + label recolor the instant the tap registers, not once the new
 * route finishes rendering.
 */
function TabContent({
  icon: Icon,
  label,
  active,
}: {
  icon: React.ElementType;
  label: string;
  active: boolean;
}) {
  const { pending } = useLinkStatus();
  const highlighted = active || pending;

  return (
    <>
      <Icon
        className={cn(
          "h-5 w-5",
          highlighted ? "text-primary" : "text-muted-foreground"
        )}
        aria-hidden="true"
      />
      <span className={highlighted ? "text-primary" : undefined}>
        {label}
      </span>
    </>
  );
}

export function BottomTabBar({ tripId }: BottomTabBarProps) {
  const pathname = usePathname();
  const tabs = buildTabs(tripId);

  return (
    <nav
      aria-label="Trip navigation"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background"
    >
      <ul className="flex items-stretch justify-around" role="list">
        {tabs.map((tab) => {
          const active = isTabActive(pathname, tab);

          return (
            <li key={tab.label} className="flex flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-0.5 px-2 py-2",
                  "min-h-[44px] text-xs font-medium",
                  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-inset focus-visible:outline-none",
                  // Immediate touch-down flash — fires before any JS
                  // navigation state exists, so the tap always registers.
                  "active:opacity-70",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <TabContent icon={tab.icon} label={tab.label} active={active} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
