/**
 * Unit tests for DayHeadcountList (#524) — the tappable per-day tokens
 * on the roster "Who's around when" block. Presentation-only client
 * component: the server half composes the view model; here we assert
 * the expand/collapse behavior, the around-vs-greyed split, and the
 * leg-time annotations.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import {
  DayHeadcountList,
  type DayPresence,
} from "../day-headcount-list";

const DAYS: DayPresence[] = [
  {
    iso: "2026-08-14",
    weekday: "fri",
    count: 2,
    members: [
      { id: "tm-1", name: "Carl", around: true, legNote: "lands 10:30 am" },
      { id: "tm-2", name: "Dave", around: true, legNote: null },
      { id: "tm-3", name: "Sam", around: false, legNote: null },
    ],
  },
  {
    iso: "2026-08-15",
    weekday: "sat",
    count: 3,
    members: [
      { id: "tm-1", name: "Carl", around: true, legNote: null },
      { id: "tm-2", name: "Dave", around: true, legNote: null },
      { id: "tm-3", name: "Sam", around: true, legNote: null },
    ],
  },
];

describe("DayHeadcountList", () => {
  it("renders one token per day in the compact 'fri 2' register, collapsed", () => {
    render(<DayHeadcountList days={DAYS} />);
    expect(screen.getByText("fri 2")).toBeInTheDocument();
    expect(screen.getByText("sat 3")).toBeInTheDocument();
    expect(screen.queryByText("Carl")).not.toBeInTheDocument();
    expect(screen.getByText("fri 2")).toHaveAttribute("aria-expanded", "false");
  });

  it("tapping a day expands the names for that day", () => {
    render(<DayHeadcountList days={DAYS} />);
    fireEvent.click(screen.getByText("fri 2"));
    expect(screen.getByText("fri 2")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Carl")).toBeInTheDocument();
    expect(screen.getByText("Dave")).toBeInTheDocument();
    expect(screen.getByText("Sam")).toBeInTheDocument();
  });

  it("tapping the open day again collapses it", () => {
    render(<DayHeadcountList days={DAYS} />);
    fireEvent.click(screen.getByText("fri 2"));
    fireEvent.click(screen.getByText("fri 2"));
    expect(screen.queryByText("Carl")).not.toBeInTheDocument();
  });

  it("tapping another day swaps the panel (one open at a time)", () => {
    render(<DayHeadcountList days={DAYS} />);
    fireEvent.click(screen.getByText("fri 2"));
    fireEvent.click(screen.getByText("sat 3"));
    expect(screen.getByText("fri 2")).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("sat 3")).toHaveAttribute("aria-expanded", "true");
    // Sam is around sat — rendered without a leg note.
    expect(screen.getByText("Sam")).toBeInTheDocument();
  });

  it("annotates names with the day's leg time when present", () => {
    render(<DayHeadcountList days={DAYS} />);
    fireEvent.click(screen.getByText("fri 2"));
    expect(screen.getByText(/lands 10:30 am/)).toBeInTheDocument();
  });

  it("greys not-around members instead of hiding them", () => {
    render(<DayHeadcountList days={DAYS} />);
    fireEvent.click(screen.getByText("fri 2"));
    const sam = screen.getByText("Sam").closest("li");
    const carl = screen.getByText("Carl").closest("li");
    // Greyed = muted class; around = full-ink class. Class names are the
    // component's contract with the design system here.
    expect(sam?.className).toContain("text-muted-foreground");
    expect(carl?.className).toContain("text-foreground");
  });

  // #552 — organizer-only "not set" marker distinguishes a member who has
  // NO day row (maybe/pending laggard) from one who explicitly marked a
  // non-going status. Keyed on `notSet`; gated on `viewerIsOrganizer`.
  describe("#552 — not-set marker", () => {
    const NOT_SET_DAYS: DayPresence[] = [
      {
        iso: "2026-08-14",
        weekday: "fri",
        count: 1,
        members: [
          { id: "tm-1", name: "Carl", around: true, legNote: null },
          // explicitly not around (has a non-going row) — NOT "not set"
          { id: "tm-2", name: "Dave", around: false, legNote: null, notSet: false },
          // never touched availability — "not set"
          { id: "tm-3", name: "Sam", around: false, legNote: null, notSet: true },
        ],
      },
    ];

    it("shows the 'hasn't set days' note on not-set members for organizers", () => {
      render(<DayHeadcountList days={NOT_SET_DAYS} viewerIsOrganizer />);
      fireEvent.click(screen.getByText("fri 1"));
      const sam = screen.getByText("Sam").closest("li");
      expect(sam?.textContent).toMatch(/hasn't set days/i);
    });

    it("does NOT show the note on members who explicitly marked a non-going day", () => {
      render(<DayHeadcountList days={NOT_SET_DAYS} viewerIsOrganizer />);
      fireEvent.click(screen.getByText("fri 1"));
      const dave = screen.getByText("Dave").closest("li");
      expect(dave?.textContent).not.toMatch(/hasn't set days/i);
    });

    it("hides the note entirely from non-organizers", () => {
      render(<DayHeadcountList days={NOT_SET_DAYS} viewerIsOrganizer={false} />);
      fireEvent.click(screen.getByText("fri 1"));
      expect(screen.queryByText(/hasn't set days/i)).not.toBeInTheDocument();
    });

    it("never shows the note on an around member", () => {
      render(<DayHeadcountList days={NOT_SET_DAYS} viewerIsOrganizer />);
      fireEvent.click(screen.getByText("fri 1"));
      const carl = screen.getByText("Carl").closest("li");
      expect(carl?.textContent).not.toMatch(/hasn't set days/i);
    });
  });
});
