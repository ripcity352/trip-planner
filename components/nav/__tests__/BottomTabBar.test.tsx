/**
 * Unit tests for BottomTabBar.
 *
 * TDD: written before implementation.
 *
 * Voice MEDIUM M2: all 5 tabs render for both organizer AND celebrant.
 * No tab is gated on role.
 *
 * Assertions:
 *   - All 5 tabs render with correct href for each persona.
 *   - Active tab has aria-current="page" for the matching pathname.
 *   - Tap targets are ≥44px (enforced via inline style / min-h class).
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BottomTabBar } from "../BottomTabBar";

// ---------------------------------------------------------------------------
// Mock next/navigation — usePathname
// ---------------------------------------------------------------------------

const mockUsePathname = vi.fn(() => "" as string);

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathname(),
}));

// #644: real next/link doesn't forward `prefetch` to the DOM (it's consumed
// internally), so the "prefetch on the active tab" tests below need a
// minimal mock that surfaces it as `data-prefetch` for assertions. Mocking
// `useLinkStatus` alongside it (real next/link exports both from the same
// module) — TabContent calls it and a bare-anchor default here would
// otherwise leave it undefined.
vi.mock("next/link", () => ({
  default: ({
    href,
    prefetch,
    children,
    ...rest
  }: {
    href: string;
    prefetch?: boolean;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} data-prefetch={String(prefetch)} {...rest}>
      {children}
    </a>
  ),
  useLinkStatus: () => ({ pending: false }),
}));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRIP_ID = "party-2026";

const EXPECTED_TABS = [
  { label: "home", href: `/trips/${TRIP_ID}` },
  { label: "plans", href: `/trips/${TRIP_ID}/itinerary` },
  { label: "updates", href: `/trips/${TRIP_ID}/announcements` },
  { label: "crew", href: `/trips/${TRIP_ID}/roster` },
  { label: "me", href: `/trips/${TRIP_ID}/me` },
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderBar(pathname: string) {
  mockUsePathname.mockReturnValue(pathname);
  return render(<BottomTabBar tripId={TRIP_ID} />);
}

/**
 * Build an exact-label regex for a tab. The "me" tab label must not match
 * "home" (which contains the substring "me"), so we use word boundaries.
 */
function tabRegex(label: string): RegExp {
  return new RegExp(`^${label}$`, "i");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BottomTabBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("tab rendering — all 5 tabs for organizer", () => {
    it("renders all 5 tab links", () => {
      renderBar(`/trips/${TRIP_ID}`);

      for (const { label } of EXPECTED_TABS) {
        expect(screen.getByRole("link", { name: tabRegex(label) })).toBeInTheDocument();
      }
    });

    it("renders correct href for each tab", () => {
      renderBar(`/trips/${TRIP_ID}`);

      for (const { label, href } of EXPECTED_TABS) {
        const link = screen.getByRole("link", { name: tabRegex(label) });
        expect(link).toHaveAttribute("href", href);
      }
    });
  });

  describe("tab rendering — all 5 tabs for celebrant (no celebrant gating)", () => {
    it("renders all 5 tab links for celebrant (no role prop means celebrant can also see all tabs)", () => {
      // Component accepts no role prop — no gating by design.
      // This test documents and enforces the no-gating requirement.
      renderBar(`/trips/${TRIP_ID}/announcements`);

      for (const { label } of EXPECTED_TABS) {
        expect(screen.getByRole("link", { name: tabRegex(label) })).toBeInTheDocument();
      }
    });
  });

  describe("active tab detection", () => {
    it("marks home tab active on exact trip root", () => {
      renderBar(`/trips/${TRIP_ID}`);

      const homeLink = screen.getByRole("link", { name: tabRegex("home") });
      expect(homeLink).toHaveAttribute("aria-current", "page");
    });

    it("marks plans tab active on /itinerary path", () => {
      renderBar(`/trips/${TRIP_ID}/itinerary`);

      const plansLink = screen.getByRole("link", { name: tabRegex("plans") });
      expect(plansLink).toHaveAttribute("aria-current", "page");
    });

    it("marks updates tab active on /announcements path", () => {
      renderBar(`/trips/${TRIP_ID}/announcements`);

      const updatesLink = screen.getByRole("link", { name: tabRegex("updates") });
      expect(updatesLink).toHaveAttribute("aria-current", "page");
    });

    it("marks crew tab active on /roster path", () => {
      renderBar(`/trips/${TRIP_ID}/roster`);

      const crewLink = screen.getByRole("link", { name: tabRegex("crew") });
      expect(crewLink).toHaveAttribute("aria-current", "page");
    });

    it("marks me tab active on /me path", () => {
      renderBar(`/trips/${TRIP_ID}/me`);

      const meLink = screen.getByRole("link", { name: tabRegex("me") });
      expect(meLink).toHaveAttribute("aria-current", "page");
    });

    it("does not mark non-active tabs with aria-current", () => {
      renderBar(`/trips/${TRIP_ID}`);

      // plans, updates, crew, me should NOT be aria-current
      const plansLink = screen.getByRole("link", { name: tabRegex("plans") });
      const updatesLink = screen.getByRole("link", { name: tabRegex("updates") });
      const crewLink = screen.getByRole("link", { name: tabRegex("crew") });
      const meLink = screen.getByRole("link", { name: tabRegex("me") });

      expect(plansLink).not.toHaveAttribute("aria-current", "page");
      expect(updatesLink).not.toHaveAttribute("aria-current", "page");
      expect(crewLink).not.toHaveAttribute("aria-current", "page");
      expect(meLink).not.toHaveAttribute("aria-current", "page");
    });

    it("marks plans active on a nested itinerary route", () => {
      renderBar(`/trips/${TRIP_ID}/itinerary?some=param`);

      const plansLink = screen.getByRole("link", { name: tabRegex("plans") });
      expect(plansLink).toHaveAttribute("aria-current", "page");
    });
  });

  describe("#644 prefetch on the active tab", () => {
    it("disables prefetch only on the tab that IS the exact current route", () => {
      renderBar(`/trips/${TRIP_ID}/itinerary`);

      const plansLink = screen.getByRole("link", { name: tabRegex("plans") });
      expect(plansLink).toHaveAttribute("data-prefetch", "false");

      // Every other tab is a real navigation target — must keep prefetching
      // (prefetch left at Link's default, i.e. not explicitly `false`).
      for (const { label } of EXPECTED_TABS) {
        if (label === "plans") continue;
        const link = screen.getByRole("link", { name: tabRegex(label) });
        expect(link).not.toHaveAttribute("data-prefetch", "false");
      }
    });

    it("keeps prefetch enabled for a prefix-active tab on a sub-route (not the exact URL)", () => {
      // "plans" is prefix-active here (isTabActive matches startsWith) but
      // its href (`/trips/<id>/itinerary`) is NOT the current URL — it's a
      // real navigation target, so disabling prefetch would be wrong.
      renderBar(`/trips/${TRIP_ID}/itinerary/some-sub-route`);

      const plansLink = screen.getByRole("link", { name: tabRegex("plans") });
      expect(plansLink).toHaveAttribute("aria-current", "page"); // prefix-active
      expect(plansLink).not.toHaveAttribute("data-prefetch", "false"); // still prefetches
    });
  });

  describe("tap targets", () => {
    it("each tab link has a min tap target class for ≥44px height", () => {
      renderBar(`/trips/${TRIP_ID}`);

      for (const { label } of EXPECTED_TABS) {
        const link = screen.getByRole("link", { name: tabRegex(label) });
        // We enforce min-h-[44px] via Tailwind class — check the class is present.
        expect(link.className).toMatch(/min-h-\[44px\]/);
      }
    });
  });

  describe("nav landmark", () => {
    it("wraps tabs in a nav element", () => {
      renderBar(`/trips/${TRIP_ID}`);
      expect(screen.getByRole("navigation")).toBeInTheDocument();
    });

    it("nav has an accessible label", () => {
      renderBar(`/trips/${TRIP_ID}`);
      const nav = screen.getByRole("navigation");
      expect(nav).toHaveAttribute("aria-label");
    });
  });
});
