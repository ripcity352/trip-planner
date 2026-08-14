/**
 * Unit tests for OrganizerRemoveLeg (#615). Mirrors the
 * AnnouncementCardActions delete-confirm tests: two-tap arm/confirm,
 * calls the action + onRemoved on success, surfaces the error on
 * failure. Mocks `deleteTravelLeg` the way announcement-card-actions'
 * tests mock their action.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { OrganizerRemoveLeg } from "../organizer-remove-leg";
import { deleteTravelLeg } from "@/lib/actions/travel-legs";

vi.mock("@/lib/actions/travel-legs", () => ({
  deleteTravelLeg: vi.fn(),
}));

const deleteTravelLegMock = vi.mocked(deleteTravelLeg);

describe("OrganizerRemoveLeg", () => {
  beforeEach(() => {
    deleteTravelLegMock.mockReset();
  });

  it("requires a second tap before calling deleteTravelLeg (two-tap confirm)", () => {
    deleteTravelLegMock.mockResolvedValue({ ok: true });
    render(<OrganizerRemoveLeg legId="leg-1" />);

    const button = screen.getByTestId("organizer-remove-leg");
    expect(button).toHaveTextContent("Remove");

    fireEvent.click(button);
    expect(deleteTravelLegMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("organizer-remove-leg")).toHaveTextContent(
      /tap again/i
    );
  });

  it("calls deleteTravelLeg and onRemoved on the second tap, on success", async () => {
    deleteTravelLegMock.mockResolvedValue({ ok: true });
    const onRemoved = vi.fn();
    render(<OrganizerRemoveLeg legId="leg-1" onRemoved={onRemoved} />);

    const button = screen.getByTestId("organizer-remove-leg");
    fireEvent.click(button); // arm
    fireEvent.click(button); // commit

    expect(deleteTravelLegMock).toHaveBeenCalledWith("leg-1");
    await waitFor(() => expect(onRemoved).toHaveBeenCalledTimes(1));
  });

  it("resets to the armed-off state after a successful commit", async () => {
    deleteTravelLegMock.mockResolvedValue({ ok: true });
    render(<OrganizerRemoveLeg legId="leg-1" />);

    const button = screen.getByTestId("organizer-remove-leg");
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() =>
      expect(screen.getByTestId("organizer-remove-leg")).toHaveTextContent(
        "Remove"
      )
    );
  });

  it("surfaces the returned error inline on a failed delete", async () => {
    deleteTravelLegMock.mockResolvedValue({
      ok: false,
      errorKey: "travel_leg_delete_failed",
    });
    render(<OrganizerRemoveLeg legId="leg-1" />);

    const button = screen.getByTestId("organizer-remove-leg");
    fireEvent.click(button);
    fireEvent.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn't delete that leg/i
    );
  });

  // Post-review fix: an inline armed control (no dropdown to close) must
  // not stay armed forever — a later, unrelated tap would otherwise commit
  // an accidental delete.
  it("auto-disarms after the timeout and does not call deleteTravelLeg on a later tap", () => {
    vi.useFakeTimers();
    try {
      deleteTravelLegMock.mockResolvedValue({ ok: true });
      render(<OrganizerRemoveLeg legId="leg-1" />);

      const button = screen.getByTestId("organizer-remove-leg");
      fireEvent.click(button); // arm
      expect(button).toHaveTextContent(/tap again/i);

      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.getByTestId("organizer-remove-leg")).toHaveTextContent(
        "Remove"
      );

      // A tap after the auto-disarm re-arms instead of committing.
      fireEvent.click(screen.getByTestId("organizer-remove-leg"));
      expect(deleteTravelLegMock).not.toHaveBeenCalled();
      expect(screen.getByTestId("organizer-remove-leg")).toHaveTextContent(
        /tap again/i
      );
    } finally {
      vi.useRealTimers();
    }
  });
});
