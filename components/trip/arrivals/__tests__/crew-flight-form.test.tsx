/**
 * Unit tests for CrewFlightForm (#574 follow-up) — log a flight the crew's
 * on, splitting the picked passengers: the viewer (if picked) → a self-leg
 * via upsertTravelLeg; everyone else → an attributed tag via
 * tagCoTravelersAction. No confirmation_code / notes are ever collected.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { CrewFlightForm } from "../crew-flight-form";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

vi.mock("@/lib/actions/travel-legs", () => ({
  upsertTravelLeg: vi.fn(),
  tagCoTravelersAction: vi.fn(),
}));

import {
  upsertTravelLeg,
  tagCoTravelersAction,
} from "@/lib/actions/travel-legs";

const mockUpsert = vi.mocked(upsertTravelLeg);
const mockTag = vi.mocked(tagCoTravelersAction);

const VIEWER = "member-1";
const candidates = [
  { id: "member-1", name: "Dave", isYou: true },
  { id: "member-2", name: "Rob", isYou: false },
  { id: "member-3", name: "Dana", isYou: false },
];

function renderForm(onDone = vi.fn()) {
  render(
    <CrewFlightForm
      tripId="trip-1"
      tripTimezone="UTC"
      viewerTripMemberId={VIEWER}
      candidates={candidates}
      onDone={onDone}
    />
  );
  return onDone;
}

const fillTime = () =>
  fireEvent.change(screen.getByLabelText(M3_UI_STRINGS.crewFlight_arrive_label), {
    target: { value: "2026-08-14T20:00" },
  });

describe("CrewFlightForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpsert.mockResolvedValue({
      ok: true,
      // minimal leg — the form ignores the returned value
      leg: { id: "leg-x" } as never,
    });
    mockTag.mockResolvedValue({ ok: true, tagged: 1 });
  });

  it("renders the viewer with a (You) marker", () => {
    renderForm();
    expect(
      screen.getByText(`Dave (${M3_UI_STRINGS.crewFlight_passengers_you})`)
    ).toBeInTheDocument();
    expect(screen.getByText("Rob")).toBeInTheDocument();
  });

  it("blocks submit with no time and no passengers", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: M3_UI_STRINGS.crewFlight_submit }));
    expect(
      await screen.findByText(M3_UI_STRINGS.crewFlight_time_required)
    ).toBeInTheDocument();
    expect(
      screen.getByText(M3_UI_STRINGS.crewFlight_passengers_required)
    ).toBeInTheDocument();
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockTag).not.toHaveBeenCalled();
  });

  it("requires at least one passenger even with a time", async () => {
    renderForm();
    fillTime();
    fireEvent.click(screen.getByRole("button", { name: M3_UI_STRINGS.crewFlight_submit }));
    expect(
      await screen.findByText(M3_UI_STRINGS.crewFlight_passengers_required)
    ).toBeInTheDocument();
    expect(mockTag).not.toHaveBeenCalled();
  });

  it("only tags others when the viewer is NOT picked (no self-leg)", async () => {
    const onDone = renderForm();
    fillTime();
    fireEvent.click(screen.getByText("Rob"));
    fireEvent.click(screen.getByText("Dana"));
    fireEvent.click(screen.getByRole("button", { name: M3_UI_STRINGS.crewFlight_submit }));

    await waitFor(() => expect(mockTag).toHaveBeenCalledOnce());
    expect(mockUpsert).not.toHaveBeenCalled();
    const [tagInput] = mockTag.mock.calls[0];
    expect(tagInput.targetTripMemberIds).toEqual(["member-2", "member-3"]);
    expect(tagInput.kind).toBe("flight");
    expect(tagInput.arriveAt).toBe("2026-08-14T20:00:00.000Z");
    // No PNR/notes collected on a crew flight.
    expect(tagInput).not.toHaveProperty("confirmationCode");
    expect(tagInput).not.toHaveProperty("notes");
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(true));
  });

  it("logs a self-leg AND tags others when the viewer is picked too", async () => {
    const onDone = renderForm();
    fillTime();
    fireEvent.click(screen.getByText(`Dave (${M3_UI_STRINGS.crewFlight_passengers_you})`));
    fireEvent.click(screen.getByText("Rob"));
    fireEvent.click(screen.getByRole("button", { name: M3_UI_STRINGS.crewFlight_submit }));

    await waitFor(() => expect(mockUpsert).toHaveBeenCalledOnce());
    await waitFor(() => expect(mockTag).toHaveBeenCalledOnce());
    const [tagInput] = mockTag.mock.calls[0];
    // The viewer is routed to the self-leg, not into the tag targets.
    expect(tagInput.targetTripMemberIds).toEqual(["member-2"]);
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(true));
  });

  it("logs only a self-leg when the viewer alone is picked", async () => {
    const onDone = renderForm();
    fillTime();
    fireEvent.click(screen.getByText(`Dave (${M3_UI_STRINGS.crewFlight_passengers_you})`));
    fireEvent.click(screen.getByRole("button", { name: M3_UI_STRINGS.crewFlight_submit }));

    await waitFor(() => expect(mockUpsert).toHaveBeenCalledOnce());
    expect(mockTag).not.toHaveBeenCalled();
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(true));
  });

  it("sends departAt (not arriveAt) for an outbound crew flight", async () => {
    renderForm();
    fireEvent.click(
      screen.getByRole("button", {
        name: M3_UI_STRINGS.crewFlight_direction_outbound,
      })
    );
    fireEvent.change(
      screen.getByLabelText(M3_UI_STRINGS.crewFlight_depart_label),
      { target: { value: "2026-08-18T09:00" } }
    );
    fireEvent.click(screen.getByText("Rob"));
    fireEvent.click(screen.getByRole("button", { name: M3_UI_STRINGS.crewFlight_submit }));

    await waitFor(() => expect(mockTag).toHaveBeenCalledOnce());
    const [tagInput] = mockTag.mock.calls[0];
    expect(tagInput.direction).toBe("outbound");
    expect(tagInput.departAt).toBe("2026-08-18T09:00:00.000Z");
    expect(tagInput.arriveAt).toBeNull();
  });

  it("surfaces an error and does not close on a tag failure", async () => {
    mockTag.mockResolvedValue({ ok: false, errorKey: "rate_limit" });
    const onDone = renderForm();
    fillTime();
    fireEvent.click(screen.getByText("Rob"));
    fireEvent.click(screen.getByRole("button", { name: M3_UI_STRINGS.crewFlight_submit }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(onDone).not.toHaveBeenCalled();
  });

  it("calls onDone(false) on cancel without writing", () => {
    const onDone = renderForm();
    fireEvent.click(screen.getByRole("button", { name: M3_UI_STRINGS.crewFlight_cancel }));
    expect(onDone).toHaveBeenCalledWith(false);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockTag).not.toHaveBeenCalled();
  });
});
