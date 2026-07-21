/**
 * Tests for `components/trip/arrivals/travel-leg-form.tsx` (#431).
 *
 * The stuck-forever sub-shape: `handleDelete` sets `isDeleting` before
 * the await and resets it after. A REJECTED `deleteTravelLeg` promise
 * used to skip the reset — `isBusy` stayed true and the WHOLE sheet
 * (every field + button) was disabled until reload. Via `callAction`
 * the rejection resolves to the network envelope: the error copy
 * renders and the sheet re-enables. Submit rejection is covered too
 * (RHF resets isSubmitting itself, but the error used to be swallowed).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { ERRORS } from "@/lib/copy/errors";
import type { TravelLeg } from "@/lib/db/types";

const upsertTravelLegMock = vi.fn();
const deleteTravelLegMock = vi.fn();

vi.mock("@/lib/actions/travel-legs", () => ({
  upsertTravelLeg: (...args: unknown[]) => upsertTravelLegMock(...args),
  deleteTravelLeg: (...args: unknown[]) => deleteTravelLegMock(...args),
}));

const TRIP_ID = "11111111-1111-4111-8111-111111111111";

// kind "drive" keeps the AirlinePicker subtree out of the render.
const LEG: TravelLeg = {
  id: "22222222-2222-4222-8222-222222222222",
  trip_id: TRIP_ID,
  trip_member_id: "33333333-3333-4333-8333-333333333333",
  kind: "drive",
  depart_at: null,
  // #478: legs need at least one time — a null/null fixture would be
  // blocked client-side before the rejected-await paths under test here.
  arrive_at: "2026-07-04T18:00:00.000Z",
  carrier: null,
  confirmation_code: null,
  notes: null,
  idempotency_key: null,
  created_at: "2026-07-01T00:00:00.000Z",
  direction: "inbound",
  airport: null,
  origin_label: null,
};

async function renderEditForm() {
  const { TravelLegForm } = await import(
    "@/components/trip/arrivals/travel-leg-form"
  );
  render(
    <TravelLegForm
      tripId={TRIP_ID}
      leg={LEG}
      tripTimezone="America/Los_Angeles"
      onSuccess={vi.fn()}
      onCancel={vi.fn()}
    />
  );
}

describe("TravelLegForm — rejected awaits (#431)", () => {
  beforeEach(() => {
    upsertTravelLegMock.mockReset();
    deleteTravelLegMock.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("delete rejection shows network copy and re-enables the sheet", async () => {
    deleteTravelLegMock.mockRejectedValue(new TypeError("fetch failed"));

    await renderEditForm();

    const deleteButton = screen.getByRole("button", {
      name: M3_UI_STRINGS.arrivals_leg_form_delete,
    });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(ERRORS.network);
    });
    // isDeleting must reset — the whole sheet keys off isBusy.
    expect(deleteButton).toBeEnabled();
    expect(
      screen.getByRole("button", {
        name: M3_UI_STRINGS.arrivals_leg_form_submit,
      })
    ).toBeEnabled();
  });

  it("submit rejection shows network copy instead of a silent no-op", async () => {
    upsertTravelLegMock.mockRejectedValue(new TypeError("fetch failed"));

    await renderEditForm();

    const submitButton = screen.getByRole("button", {
      name: M3_UI_STRINGS.arrivals_leg_form_submit,
    });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(ERRORS.network);
    });
    expect(submitButton).toBeEnabled();
  });
});
