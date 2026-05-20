/**
 * Tests for `components/trip/trip-notes-editor.tsx`
 *
 * The editor is a "use client" component. It:
 *   1. Renders a heading + the current notes (or empty-state).
 *   2. Shows the edit CTA when isOrganizer=true.
 *   3. Does NOT show the edit CTA when isOrganizer=false.
 *   4. Toggles to an edit form on "Edit" click.
 *   5. Calls setTripNotes with { tripId, notes } on form submit.
 *   6. Returns to view mode on save success.
 *   7. Shows error toast copy on save failure.
 *   8. Cancels edit without saving on "Cancel" click.
 *
 * setTripNotes is mocked; we assert call shape and result handling.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS } from "@/lib/copy/errors";

const setTripNotesMock = vi.fn();

vi.mock("@/lib/actions/trip-notes", () => ({
  setTripNotes: (...args: unknown[]) => setTripNotesMock(...args),
}));

const TRIP_ID = "11111111-1111-4111-8111-111111111111";

describe("TripNotesEditor", () => {
  beforeEach(() => {
    setTripNotesMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders notes heading", async () => {
    const { TripNotesEditor } = await import(
      "@/components/trip/trip-notes-editor"
    );
    render(
      <TripNotesEditor tripId={TRIP_ID} initialNotes={null} isOrganizer={false} />
    );
    expect(
      screen.getByText(M3_UI_STRINGS.tripNotes_heading)
    ).toBeInTheDocument();
  });

  it("does NOT render edit button for non-organizer", async () => {
    const { TripNotesEditor } = await import(
      "@/components/trip/trip-notes-editor"
    );
    render(
      <TripNotesEditor tripId={TRIP_ID} initialNotes={null} isOrganizer={false} />
    );
    expect(
      screen.queryByRole("button", { name: M3_UI_STRINGS.tripNotes_edit_cta })
    ).not.toBeInTheDocument();
  });

  it("renders edit button for organizer", async () => {
    const { TripNotesEditor } = await import(
      "@/components/trip/trip-notes-editor"
    );
    render(
      <TripNotesEditor tripId={TRIP_ID} initialNotes={null} isOrganizer={true} />
    );
    expect(
      screen.getByRole("button", { name: M3_UI_STRINGS.tripNotes_edit_cta })
    ).toBeInTheDocument();
  });

  it("shows textarea on edit button click", async () => {
    const { TripNotesEditor } = await import(
      "@/components/trip/trip-notes-editor"
    );
    render(
      <TripNotesEditor
        tripId={TRIP_ID}
        initialNotes="Some notes"
        isOrganizer={true}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: M3_UI_STRINGS.tripNotes_edit_cta })
    );

    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: M3_UI_STRINGS.tripNotes_save_cta })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: M3_UI_STRINGS.tripNotes_cancel_cta })
    ).toBeInTheDocument();
  });

  it("cancel returns to view mode without calling setTripNotes", async () => {
    const { TripNotesEditor } = await import(
      "@/components/trip/trip-notes-editor"
    );
    render(
      <TripNotesEditor
        tripId={TRIP_ID}
        initialNotes="Some notes"
        isOrganizer={true}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: M3_UI_STRINGS.tripNotes_edit_cta })
    );
    fireEvent.click(
      screen.getByRole("button", { name: M3_UI_STRINGS.tripNotes_cancel_cta })
    );

    expect(setTripNotesMock).not.toHaveBeenCalled();
    // Back to view mode — edit button visible again
    expect(
      screen.getByRole("button", { name: M3_UI_STRINGS.tripNotes_edit_cta })
    ).toBeInTheDocument();
  });

  it("calls setTripNotes with tripId + notes on submit", async () => {
    setTripNotesMock.mockResolvedValue({ ok: true });

    const { TripNotesEditor } = await import(
      "@/components/trip/trip-notes-editor"
    );
    render(
      <TripNotesEditor
        tripId={TRIP_ID}
        initialNotes="Old notes"
        isOrganizer={true}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: M3_UI_STRINGS.tripNotes_edit_cta })
    );

    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, {
      target: { value: "Updated hotel WiFi: abc123" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: M3_UI_STRINGS.tripNotes_save_cta })
    );

    await waitFor(() => {
      expect(setTripNotesMock).toHaveBeenCalledWith({
        tripId: TRIP_ID,
        notes: "Updated hotel WiFi: abc123",
      });
    });
  });

  it("returns to view mode after successful save", async () => {
    setTripNotesMock.mockResolvedValue({ ok: true });

    const { TripNotesEditor } = await import(
      "@/components/trip/trip-notes-editor"
    );
    render(
      <TripNotesEditor
        tripId={TRIP_ID}
        initialNotes="Old notes"
        isOrganizer={true}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: M3_UI_STRINGS.tripNotes_edit_cta })
    );
    fireEvent.click(
      screen.getByRole("button", { name: M3_UI_STRINGS.tripNotes_save_cta })
    );

    await waitFor(() => {
      // Back to view mode — edit button is visible again
      expect(
        screen.getByRole("button", { name: M3_UI_STRINGS.tripNotes_edit_cta })
      ).toBeInTheDocument();
    });
  });

  it("gives the textarea an accessible name via aria-labelledby", async () => {
    const { TripNotesEditor } = await import(
      "@/components/trip/trip-notes-editor"
    );
    render(
      <TripNotesEditor
        tripId={TRIP_ID}
        initialNotes="Some notes"
        isOrganizer={true}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: M3_UI_STRINGS.tripNotes_edit_cta })
    );

    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveAttribute("aria-labelledby", "trip-notes-heading");
    // The headline that the textarea references must exist with the matching id
    const heading = document.getElementById("trip-notes-heading");
    expect(heading).not.toBeNull();
    expect(heading?.textContent).toBe(M3_UI_STRINGS.tripNotes_heading);
  });

  it("cancel restores the form so a typed-then-cancelled edit does not leak into the next session", async () => {
    const { TripNotesEditor } = await import(
      "@/components/trip/trip-notes-editor"
    );
    render(
      <TripNotesEditor
        tripId={TRIP_ID}
        initialNotes="Original notes"
        isOrganizer={true}
      />
    );

    // First edit session: type a value, then cancel.
    fireEvent.click(
      screen.getByRole("button", { name: M3_UI_STRINGS.tripNotes_edit_cta })
    );
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Half-typed draft" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: M3_UI_STRINGS.tripNotes_cancel_cta })
    );

    // Second edit session: textarea should show the original notes, not the half-typed draft.
    fireEvent.click(
      screen.getByRole("button", { name: M3_UI_STRINGS.tripNotes_edit_cta })
    );
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.value).toBe("Original notes");
  });

  it("shows error copy on save failure", async () => {
    setTripNotesMock.mockResolvedValue({
      ok: false,
      errorKey: "trip_notes_save_failed",
    });

    const { TripNotesEditor } = await import(
      "@/components/trip/trip-notes-editor"
    );
    render(
      <TripNotesEditor
        tripId={TRIP_ID}
        initialNotes="Some notes"
        isOrganizer={true}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: M3_UI_STRINGS.tripNotes_edit_cta })
    );
    fireEvent.click(
      screen.getByRole("button", { name: M3_UI_STRINGS.tripNotes_save_cta })
    );

    await waitFor(() => {
      expect(
        screen.getByText(ERRORS.trip_notes_save_failed)
      ).toBeInTheDocument();
    });
    // Stays in edit mode after failure so the user can retry
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });
});
