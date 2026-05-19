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

  it("after a failed attempt rolls state back, clicking the same value retries with a fresh idempotency_key", async () => {
    // Initial confirmed status = "going". User clicks "maybe", server
    // returns an error, state rolls back to "going". A second click
    // on "going" should NOT be short-circuited — the prior attempt
    // was a "maybe" write that failed; the user is now reasserting
    // their "going" position and deserves a retry.
    const idempotencyKeys: string[] = [];
    let counter = 0;
    vi.stubGlobal("crypto", {
      ...globalThis.crypto,
      randomUUID: vi.fn(() => {
        counter += 1;
        const key = `uuid-${counter}`;
        idempotencyKeys.push(key);
        return key;
      }),
    });

    // First call (maybe) fails; second call (going) succeeds.
    setRsvpActionMock
      .mockResolvedValueOnce({ ok: false, errorKey: "rsvp_save_failed" })
      .mockResolvedValueOnce({ ok: true, status: "going" });

    render(<RsvpToggle tripId={TRIP_ID} initialStatus="going" />);
    const goingChip = screen.getByRole("button", {
      name: M2_UI_STRINGS.rsvp_chip_going,
    });
    const maybeChip = screen.getByRole("button", {
      name: M2_UI_STRINGS.rsvp_chip_maybe,
    });

    fireEvent.click(maybeChip);
    // Wait for rollback to land — going is pressed again after failure.
    await waitFor(() => {
      expect(goingChip).toHaveAttribute("aria-pressed", "true");
      expect(maybeChip).toHaveAttribute("aria-pressed", "false");
    });
    expect(setRsvpActionMock).toHaveBeenCalledTimes(1);

    // Now click going — this must NOT be short-circuited even though
    // the optimistic state already shows "going". The user is retrying
    // after a failed write.
    fireEvent.click(goingChip);

    await waitFor(() => {
      expect(setRsvpActionMock).toHaveBeenCalledTimes(2);
    });
    // Second call used a fresh idempotency_key, not the failed one.
    expect(idempotencyKeys.length).toBe(2);
    expect(idempotencyKeys[0]).not.toBe(idempotencyKeys[1]);
    expect(setRsvpActionMock).toHaveBeenNthCalledWith(
      2,
      { tripId: TRIP_ID, status: "going" },
      idempotencyKeys[1]
    );
  });
});
