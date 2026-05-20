/**
 * Tests for `components/trip/trip-notes-view.tsx`
 *
 * The view component renders trip notes text (read-only). It has two
 * empty-state variants driven by the `isOrganizer` prop:
 *   - organizer sees the prompt-to-fill copy
 *   - member sees the "nothing posted yet" copy
 *
 * Both render the heading from the copy palette.
 */

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

describe("TripNotesView", () => {
  it("renders the heading", async () => {
    const { TripNotesView } = await import("@/components/trip/trip-notes-view");
    render(<TripNotesView notes={null} isOrganizer={false} />);
    expect(
      screen.getByText(M3_UI_STRINGS.tripNotes_heading)
    ).toBeInTheDocument();
  });

  it("renders the notes text when notes are set", async () => {
    const { TripNotesView } = await import("@/components/trip/trip-notes-view");
    render(
      <TripNotesView
        notes="Hotel WiFi: bestman2026. Dress code: smart casual."
        isOrganizer={false}
      />
    );
    expect(
      screen.getByText("Hotel WiFi: bestman2026. Dress code: smart casual.")
    ).toBeInTheDocument();
  });

  it("renders organizer empty-state copy when isOrganizer=true and notes are empty", async () => {
    const { TripNotesView } = await import("@/components/trip/trip-notes-view");
    render(<TripNotesView notes={null} isOrganizer={true} />);
    expect(
      screen.getByText(M3_UI_STRINGS.tripNotes_empty_organizer)
    ).toBeInTheDocument();
  });

  it("renders member empty-state copy when isOrganizer=false and notes are empty", async () => {
    const { TripNotesView } = await import("@/components/trip/trip-notes-view");
    render(<TripNotesView notes={null} isOrganizer={false} />);
    expect(
      screen.getByText(M3_UI_STRINGS.tripNotes_empty_member)
    ).toBeInTheDocument();
  });

  it("does not render empty-state when notes are present", async () => {
    const { TripNotesView } = await import("@/components/trip/trip-notes-view");
    render(
      <TripNotesView notes="Something here" isOrganizer={true} />
    );
    expect(
      screen.queryByText(M3_UI_STRINGS.tripNotes_empty_organizer)
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(M3_UI_STRINGS.tripNotes_empty_member)
    ).not.toBeInTheDocument();
  });

  it("renders empty string notes as empty (falsy)", async () => {
    const { TripNotesView } = await import("@/components/trip/trip-notes-view");
    render(<TripNotesView notes="" isOrganizer={false} />);
    expect(
      screen.getByText(M3_UI_STRINGS.tripNotes_empty_member)
    ).toBeInTheDocument();
  });
});
