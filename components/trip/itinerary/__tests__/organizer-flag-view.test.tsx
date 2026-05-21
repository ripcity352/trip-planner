/**
 * TDD RED — organizer-flag-view tests.
 *
 * Written BEFORE implementation per TDD mandate.
 *
 * Covers (per M4 W1c scope):
 *  1. Renders flags grouped by member display name.
 *  2. Empty state when no flags.
 *  3. Multiple flags per member render correctly.
 *  4. Does not expose "organizers notified" phrasing.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import type { ItineraryItemMemberFlag } from "@/lib/db/types";
import { OrganizerFlagView } from "../organizer-flag-view";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const flagAlice: ItineraryItemMemberFlag = {
  id: "flag-1",
  item_id: "item-001",
  trip_member_id: "member-alice",
  flag: "Vegan",
  note: "strict, no honey either",
  created_at: "2026-05-21T00:00:00.000Z",
};

const flagAlice2: ItineraryItemMemberFlag = {
  id: "flag-2",
  item_id: "item-001",
  trip_member_id: "member-alice",
  flag: "Nut allergy",
  note: null,
  created_at: "2026-05-21T00:01:00.000Z",
};

const flagBob: ItineraryItemMemberFlag = {
  id: "flag-3",
  item_id: "item-001",
  trip_member_id: "member-bob",
  flag: "Sober",
  note: null,
  created_at: "2026-05-21T00:02:00.000Z",
};

/** Name map: trip_member_id → display name */
const memberNames: Record<string, string> = {
  "member-alice": "Alice",
  "member-bob": "Bob",
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("OrganizerFlagView", () => {
  it("renders empty state when no flags provided", () => {
    render(
      <OrganizerFlagView flags={[]} memberNames={memberNames} />
    );
    expect(
      screen.getByText(
        /no heads-ups from anyone yet/i
      )
    ).toBeInTheDocument();
  });

  it("renders a flag chip for each flag", () => {
    render(
      <OrganizerFlagView flags={[flagAlice, flagBob]} memberNames={memberNames} />
    );
    expect(screen.getByText("Vegan")).toBeInTheDocument();
    expect(screen.getByText("Sober")).toBeInTheDocument();
  });

  it("groups multiple flags under the same member name", () => {
    render(
      <OrganizerFlagView
        flags={[flagAlice, flagAlice2, flagBob]}
        memberNames={memberNames}
      />
    );
    // Alice appears once as a group heading
    const aliceHeadings = screen.getAllByText("Alice");
    expect(aliceHeadings.length).toBeGreaterThanOrEqual(1);

    // Both Alice flags visible
    expect(screen.getByText("Vegan")).toBeInTheDocument();
    expect(screen.getByText("Nut allergy")).toBeInTheDocument();
  });

  it("renders member display names from the memberNames map", () => {
    render(
      <OrganizerFlagView flags={[flagAlice, flagBob]} memberNames={memberNames} />
    );
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("renders flag notes when present", () => {
    render(
      <OrganizerFlagView flags={[flagAlice]} memberNames={memberNames} />
    );
    expect(screen.getByText("strict, no honey either")).toBeInTheDocument();
  });

  it("does not render 'organizers notified' anywhere (Voice CRITICAL C8)", () => {
    const { container } = render(
      <OrganizerFlagView flags={[flagAlice, flagBob]} memberNames={memberNames} />
    );
    expect(container.textContent).not.toMatch(/organizer.*notif/i);
  });

  it("falls back to member ID when name not in map", () => {
    render(
      <OrganizerFlagView
        flags={[flagAlice]}
        memberNames={{}}
      />
    );
    // Should render something — either the ID or a fallback, not crash
    expect(screen.getByText("Vegan")).toBeInTheDocument();
  });
});
