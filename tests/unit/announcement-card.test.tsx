/**
 * AnnouncementCard — author attribution tests (#239).
 *
 * TDD RED: these tests must fail before the implementation is wired.
 * Run `pnpm test` — expect failures until AnnouncementCard uses the
 * announcements_author_fallback copy key and AnnouncementList passes
 * authorDisplayName correctly.
 *
 * Override C: tests live in tests/unit/ only (never under app/).
 * Override F: no inline string literals — copy sourced from M3_UI_STRINGS.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { AnnouncementCard } from "@/components/trip/announcements/announcement-card";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import type { Announcement } from "@/lib/db/types";

// ---- Fixtures ---------------------------------------------------------------

const BASE_ANNOUNCEMENT: Announcement = {
  id: "ann-001",
  trip_id: "trip-001",
  author_id: "aaaaaaaa-0000-0000-0000-000000000001",
  body: "Doors open at 9pm. Don't be late.",
  pinned: false,
  created_at: "2026-05-22T18:00:00Z",
  idempotency_key: null,
  visibility: "everyone",
  created_by: "aaaaaaaa-0000-0000-0000-000000000001",
};

// ---- Tests ------------------------------------------------------------------

describe("AnnouncementCard — author attribution", () => {
  it("renders the author display name when provided", () => {
    render(
      <AnnouncementCard
        announcement={BASE_ANNOUNCEMENT}
        authorDisplayName="Alice"
      />
    );

    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it('renders the announcements_author_fallback ("Someone") when authorDisplayName is undefined', () => {
    render(<AnnouncementCard announcement={BASE_ANNOUNCEMENT} />);

    expect(
      screen.getByText(M3_UI_STRINGS.announcements_author_fallback)
    ).toBeInTheDocument();
    // Verify the constant itself is "Someone" (voice-lock double-check)
    expect(M3_UI_STRINGS.announcements_author_fallback).toBe("Someone");
  });

  it('renders the fallback ("Someone") when authorDisplayName is null', () => {
    render(
      <AnnouncementCard
        announcement={BASE_ANNOUNCEMENT}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing null passthrough from realtime payload
        authorDisplayName={null as any}
      />
    );

    expect(
      screen.getByText(M3_UI_STRINGS.announcements_author_fallback)
    ).toBeInTheDocument();
  });

  it("never renders a raw UUID in the author position", () => {
    // author_id is a UUID — it must never surface in the footer
    render(<AnnouncementCard announcement={BASE_ANNOUNCEMENT} />);

    const footer = screen.getByRole("contentinfo");
    expect(footer.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);
    expect(footer.textContent).not.toContain(BASE_ANNOUNCEMENT.author_id);
    expect(footer.textContent).not.toContain(BASE_ANNOUNCEMENT.created_by!);
  });

  it('never renders "Guest" in the author fallback position (wrong fallback guard)', () => {
    // "Guest" is the roster_member_fallback_name — wrong context for announcements.
    render(<AnnouncementCard announcement={BASE_ANNOUNCEMENT} />);

    const footer = screen.getByRole("contentinfo");
    expect(footer.textContent).not.toContain(
      M3_UI_STRINGS.roster_member_fallback_name // "Guest"
    );
  });

  it("renders the announcement body regardless of authorDisplayName", () => {
    render(<AnnouncementCard announcement={BASE_ANNOUNCEMENT} />);

    expect(
      screen.getByText("Doors open at 9pm. Don't be late.")
    ).toBeInTheDocument();
  });
});
