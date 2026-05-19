/**
 * Tests for `components/trip/rsvp-toggle.tsx`.
 *
 * The toggle owns three responsibilities, exercised here in jsdom:
 *
 *   1. Render all three chips (Going / Maybe / Can't make it) sourced
 *      from `M2_UI_STRINGS.rsvp_chip_*` — voice-tested labels, no
 *      inline literals.
 *   2. Mark the chip matching `initialStatus` as active.
 *   3. On click: optimistically set the active chip, fire the server
 *      action, and roll back on error.
 *
 * The server action is mocked. We assert calls and shape, not the
 * action's own behavior (covered separately in
 * `lib/actions/__tests__/rsvp.test.ts`).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Stable crypto.randomUUID for assertion on the idempotency_key arg.
beforeEach(() => {
  // Stub at the global level so the component's call site picks it up.
  vi.stubGlobal("crypto", {
    ...globalThis.crypto,
    randomUUID: vi.fn(() => "uuid-fixed"),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const setRsvpActionMock = vi.fn();

vi.mock("@/lib/actions/rsvp", () => ({
  setRsvpAction: (...args: unknown[]) => setRsvpActionMock(...args),
}));

import { RsvpToggle } from "@/components/trip/rsvp-toggle";
import { M2_UI_STRINGS } from "@/lib/copy/empty-states";

const TRIP_ID = "11111111-1111-4111-8111-111111111111";

describe("<RsvpToggle />", () => {
  beforeEach(() => {
    setRsvpActionMock.mockReset();
  });

  it("renders all three chips with copy-palette labels", () => {
    render(<RsvpToggle tripId={TRIP_ID} initialStatus="pending" />);
    expect(
      screen.getByRole("button", { name: M2_UI_STRINGS.rsvp_chip_going })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: M2_UI_STRINGS.rsvp_chip_maybe })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: M2_UI_STRINGS.rsvp_chip_declined })
    ).toBeInTheDocument();
  });

  it("marks the chip matching initialStatus as pressed", () => {
    render(<RsvpToggle tripId={TRIP_ID} initialStatus="maybe" />);
    const maybeChip = screen.getByRole("button", {
      name: M2_UI_STRINGS.rsvp_chip_maybe,
    });
    const goingChip = screen.getByRole("button", {
      name: M2_UI_STRINGS.rsvp_chip_going,
    });
    expect(maybeChip).toHaveAttribute("aria-pressed", "true");
    expect(goingChip).toHaveAttribute("aria-pressed", "false");
  });

  it("no chip is pressed when initialStatus is pending", () => {
    render(<RsvpToggle tripId={TRIP_ID} initialStatus="pending" />);
    expect(
      screen.getByRole("button", { name: M2_UI_STRINGS.rsvp_chip_going })
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: M2_UI_STRINGS.rsvp_chip_maybe })
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByRole("button", { name: M2_UI_STRINGS.rsvp_chip_declined })
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("optimistically activates the clicked chip and calls setRsvpAction with a fresh idempotency_key", async () => {
    setRsvpActionMock.mockResolvedValue({ ok: true, status: "going" });

    render(<RsvpToggle tripId={TRIP_ID} initialStatus="pending" />);
    const goingChip = screen.getByRole("button", {
      name: M2_UI_STRINGS.rsvp_chip_going,
    });

    fireEvent.click(goingChip);

    // Optimistic update should land before the action resolves.
    await waitFor(() => {
      expect(goingChip).toHaveAttribute("aria-pressed", "true");
    });

    expect(setRsvpActionMock).toHaveBeenCalledTimes(1);
    expect(setRsvpActionMock).toHaveBeenCalledWith(
      { tripId: TRIP_ID, status: "going" },
      "uuid-fixed"
    );
  });

  it("rolls back the local state when the server action returns an error", async () => {
    setRsvpActionMock.mockResolvedValue({
      ok: false,
      errorKey: "rsvp_save_failed",
    });

    render(<RsvpToggle tripId={TRIP_ID} initialStatus="maybe" />);
    const goingChip = screen.getByRole("button", {
      name: M2_UI_STRINGS.rsvp_chip_going,
    });
    const maybeChip = screen.getByRole("button", {
      name: M2_UI_STRINGS.rsvp_chip_maybe,
    });

    fireEvent.click(goingChip);

    // Eventually rolls back to maybe (the prior state).
    await waitFor(() => {
      expect(maybeChip).toHaveAttribute("aria-pressed", "true");
      expect(goingChip).toHaveAttribute("aria-pressed", "false");
    });
  });

  it("clicking the currently-active chip is a no-op (does not call the action)", async () => {
    render(<RsvpToggle tripId={TRIP_ID} initialStatus="going" />);
    const goingChip = screen.getByRole("button", {
      name: M2_UI_STRINGS.rsvp_chip_going,
    });

    fireEvent.click(goingChip);

    // No spurious calls — same-state click is a no-op so we never
    // double-charge the rate limiter for a click that means nothing.
    expect(setRsvpActionMock).not.toHaveBeenCalled();
  });
});
