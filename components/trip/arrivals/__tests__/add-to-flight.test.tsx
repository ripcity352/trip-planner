/**
 * Unit tests for AddToFlight (#574 follow-up) — the per-card "add who's on
 * this flight" control. Reuses the flight's own details and fans out
 * attributed pending tags via tagCoTravelersAction (no re-entry, no PNR).
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { AddToFlight } from "../add-to-flight";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import type { TravelLeg } from "@/lib/db/types";

vi.mock("@/lib/actions/travel-legs", () => ({
  tagCoTravelersAction: vi.fn(),
}));

import { tagCoTravelersAction } from "@/lib/actions/travel-legs";

const mockTag = vi.mocked(tagCoTravelersAction);

const leg: TravelLeg = {
  id: "leg-jus",
  trip_id: "trip-1",
  trip_member_id: "member-jus",
  kind: "flight",
  depart_at: null,
  arrive_at: "2026-08-14T16:17:00.000Z",
  carrier: null,
  confirmation_code: "SECRET",
  notes: "Jar Jus Mend",
  idempotency_key: null,
  created_at: "2026-05-20T00:00:00Z",
  airline_iata: "HA",
  flight_number: "AS840",
  direction: "inbound",
  airport: "PDX",
  origin_label: "HNL",
  written_by_trip_member_id: null,
};

const candidates = [
  { id: "member-jar", name: "Jar" },
  { id: "member-mend", name: "Mend" },
];

describe("AddToFlight", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTag.mockResolvedValue({ ok: true, tagged: 2 });
  });

  it("renders nothing when there are no candidates", () => {
    const { container } = render(
      <AddToFlight leg={leg} candidates={[]} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the trigger and expands the picker on click", () => {
    render(<AddToFlight leg={leg} candidates={candidates} />);
    const trigger = screen.getByRole("button", {
      name: M3_UI_STRINGS.addToFlight_trigger,
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(screen.getByText("Jar")).toBeInTheDocument();
    expect(screen.getByText("Mend")).toBeInTheDocument();
  });

  it("Add is disabled until at least one person is picked", () => {
    render(<AddToFlight leg={leg} candidates={candidates} />);
    fireEvent.click(
      screen.getByRole("button", { name: M3_UI_STRINGS.addToFlight_trigger })
    );
    expect(
      screen.getByRole("button", { name: M3_UI_STRINGS.addToFlight_submit })
    ).toBeDisabled();
    fireEvent.click(screen.getByText("Jar"));
    expect(
      screen.getByRole("button", { name: M3_UI_STRINGS.addToFlight_submit })
    ).toBeEnabled();
  });

  it("tags the picked members with THIS flight's details (no PNR/notes)", async () => {
    const onAdded = vi.fn();
    render(<AddToFlight leg={leg} candidates={candidates} onAdded={onAdded} />);
    fireEvent.click(
      screen.getByRole("button", { name: M3_UI_STRINGS.addToFlight_trigger })
    );
    fireEvent.click(screen.getByText("Jar"));
    fireEvent.click(screen.getByText("Mend"));
    fireEvent.click(
      screen.getByRole("button", { name: M3_UI_STRINGS.addToFlight_submit })
    );

    await waitFor(() => expect(mockTag).toHaveBeenCalledOnce());
    const [input] = mockTag.mock.calls[0];
    expect(input.tripId).toBe("trip-1");
    expect(input.targetTripMemberIds).toEqual(["member-jar", "member-mend"]);
    expect(input.kind).toBe("flight");
    expect(input.direction).toBe("inbound");
    expect(input.arriveAt).toBe("2026-08-14T16:17:00.000Z");
    expect(input.airlineIata).toBe("HA");
    expect(input.flightNumber).toBe("AS840");
    expect(input.airport).toBe("PDX");
    // Origin ("from HNL") is a shareable fact — reused, not dropped.
    expect(input.originLabel).toBe("HNL");
    // The owner's PNR + personal notes are never propagated.
    expect(input).not.toHaveProperty("confirmationCode");
    expect(input).not.toHaveProperty("notes");
    await waitFor(() => expect(onAdded).toHaveBeenCalledOnce());
  });

  it("surfaces an error and stays open on failure", async () => {
    mockTag.mockResolvedValue({ ok: false, errorKey: "rate_limit" });
    const onAdded = vi.fn();
    render(<AddToFlight leg={leg} candidates={candidates} onAdded={onAdded} />);
    fireEvent.click(
      screen.getByRole("button", { name: M3_UI_STRINGS.addToFlight_trigger })
    );
    fireEvent.click(screen.getByText("Jar"));
    fireEvent.click(
      screen.getByRole("button", { name: M3_UI_STRINGS.addToFlight_submit })
    );

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(onAdded).not.toHaveBeenCalled();
    // still expanded
    expect(screen.getByText("Jar")).toBeInTheDocument();
  });
});
