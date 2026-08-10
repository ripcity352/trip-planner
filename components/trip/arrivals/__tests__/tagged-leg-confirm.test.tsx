/**
 * Unit tests for TaggedLegConfirm (#574) — the tagged member's confirm/
 * dismiss control for a pending co-traveler tag. "Yep, that's me" adopts the
 * leg (confirmTaggedLeg clears attribution); "Not me" removes it
 * (deleteTravelLeg — the pending tag is the member's own row).
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { TaggedLegConfirm } from "../tagged-leg-confirm";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

vi.mock("@/lib/actions/travel-legs", () => ({
  confirmTaggedLeg: vi.fn(),
  deleteTravelLeg: vi.fn(),
}));

import { confirmTaggedLeg, deleteTravelLeg } from "@/lib/actions/travel-legs";

const confirmMock = vi.mocked(confirmTaggedLeg);
const deleteMock = vi.mocked(deleteTravelLeg);

const LEG_ID = "33333333-3333-4333-8333-333333333333";

describe("TaggedLegConfirm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmMock.mockResolvedValue({ ok: true });
    deleteMock.mockResolvedValue({ ok: true });
  });

  it("renders the tagger's name in the heading", () => {
    render(<TaggedLegConfirm legId={LEG_ID} taggerName="Dave" />);
    expect(
      screen.getByText("Dave says you're on this flight.")
    ).toBeInTheDocument();
  });

  it("confirms via confirmTaggedLeg (adopt) and hides + calls onResolved", async () => {
    const onResolved = vi.fn();
    render(
      <TaggedLegConfirm
        legId={LEG_ID}
        taggerName="Dave"
        onResolved={onResolved}
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: M3_UI_STRINGS.arrivals_tag_confirm_cta,
      })
    );

    await waitFor(() => expect(confirmMock).toHaveBeenCalledWith(LEG_ID));
    expect(deleteMock).not.toHaveBeenCalled();
    await waitFor(() => expect(onResolved).toHaveBeenCalledOnce());
    expect(
      screen.queryByText("Dave says you're on this flight.")
    ).not.toBeInTheDocument();
  });

  it("dismisses via deleteTravelLeg (Not me) and hides + calls onResolved", async () => {
    const onResolved = vi.fn();
    render(
      <TaggedLegConfirm
        legId={LEG_ID}
        taggerName="Dave"
        onResolved={onResolved}
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: M3_UI_STRINGS.arrivals_tag_dismiss_cta,
      })
    );

    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith(LEG_ID));
    expect(confirmMock).not.toHaveBeenCalled();
    await waitFor(() => expect(onResolved).toHaveBeenCalledOnce());
  });

  it("keeps the prompt visible and shows an error on failure", async () => {
    confirmMock.mockResolvedValue({ ok: false, errorKey: "rate_limit" });
    const onResolved = vi.fn();
    render(
      <TaggedLegConfirm
        legId={LEG_ID}
        taggerName="Dave"
        onResolved={onResolved}
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: M3_UI_STRINGS.arrivals_tag_confirm_cta,
      })
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toBeInTheDocument()
    );
    expect(onResolved).not.toHaveBeenCalled();
    expect(
      screen.getByText("Dave says you're on this flight.")
    ).toBeInTheDocument();
  });
});
