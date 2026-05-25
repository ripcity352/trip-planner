/**
 * Unit tests for TravelLegForm — TDD RED phase.
 * Written before implementation.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TravelLegForm } from "../travel-leg-form";
import type { TravelLeg } from "@/lib/db/types";

// Mock server actions
vi.mock("@/lib/actions/travel-legs", () => ({
  upsertTravelLeg: vi.fn(),
  deleteTravelLeg: vi.fn(),
}));

import { upsertTravelLeg, deleteTravelLeg } from "@/lib/actions/travel-legs";

const mockUpsert = vi.mocked(upsertTravelLeg);
const mockDelete = vi.mocked(deleteTravelLeg);

const makeLeg = (overrides: Partial<TravelLeg> = {}): TravelLeg => ({
  id: "leg-1",
  trip_id: "trip-1",
  trip_member_id: "member-1",
  kind: "flight",
  depart_at: "2026-08-14T06:00:00Z",
  arrive_at: "2026-08-14T10:30:00Z",
  carrier: "Southwest",
  confirmation_code: "ABC123",
  notes: "Window seat please",
  idempotency_key: null,
  created_at: "2026-05-20T00:00:00Z",
  airline_iata: null,
  flight_number: null,
  ...overrides,
});

describe("TravelLegForm — add mode", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders all form fields (flight default — AirlinePicker instead of plain carrier)", () => {
    render(
      <TravelLegForm
        tripId="trip-1"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByLabelText("How")).toBeInTheDocument();
    expect(screen.getByLabelText("Leave")).toBeInTheDocument();
    expect(screen.getByLabelText("Arrive")).toBeInTheDocument();
    // Default kind is "flight" — AirlinePicker renders instead of plain carrier input
    expect(screen.getByRole("combobox", { name: /airline/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Carrier")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Confirmation #")).toBeInTheDocument();
    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
  });

  it("renders kind options: Flight, Train, Drive, Other", () => {
    render(
      <TravelLegForm
        tripId="trip-1"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const select = screen.getByLabelText("How");
    expect(select).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Flight" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Train" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Drive" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Other" })).toBeInTheDocument();
  });

  it("renders the submit button with 'Save it' label", () => {
    render(
      <TravelLegForm
        tripId="trip-1"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: "Save it" })
    ).toBeInTheDocument();
  });

  it("calls onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(
      <TravelLegForm
        tripId="trip-1"
        onSuccess={vi.fn()}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("calls upsertTravelLeg with correct tripId and kind on submit", async () => {
    const onSuccess = vi.fn();
    const fakeLeg = makeLeg();
    mockUpsert.mockResolvedValue({ ok: true, leg: fakeLeg });

    render(
      <TravelLegForm
        tripId="trip-1"
        onSuccess={onSuccess}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Save it" }));

    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ tripId: "trip-1", kind: "flight" }),
        expect.any(String) // idempotency key
      );
    });
  });

  it("calls onSuccess after successful upsert", async () => {
    const onSuccess = vi.fn();
    mockUpsert.mockResolvedValue({ ok: true, leg: makeLeg() });

    render(
      <TravelLegForm
        tripId="trip-1"
        onSuccess={onSuccess}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Save it" }));

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledOnce();
    });
  });

  it("shows error message on upsert failure", async () => {
    mockUpsert.mockResolvedValue({
      ok: false,
      errorKey: "travel_leg_save_failed",
    });

    render(
      <TravelLegForm
        tripId="trip-1"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Save it" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("does not render a delete button in add mode", () => {
    render(
      <TravelLegForm
        tripId="trip-1"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(
      screen.queryByRole("button", { name: /delete/i })
    ).not.toBeInTheDocument();
  });
});

describe("TravelLegForm — edit mode", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("pre-populates fields from the existing leg (train kind — plain carrier input)", () => {
    render(
      <TravelLegForm
        tripId="trip-1"
        leg={makeLeg({ kind: "train" })}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // Train uses plain carrier input — verify pre-population
    const carrierInput = screen.getByLabelText("Carrier") as HTMLInputElement;
    expect(carrierInput.value).toBe("Southwest");

    const confirmationInput = screen.getByLabelText(
      "Confirmation #"
    ) as HTMLInputElement;
    expect(confirmationInput.value).toBe("ABC123");
  });

  it("pre-populates kind select from the existing leg", () => {
    render(
      <TravelLegForm
        tripId="trip-1"
        leg={makeLeg({ kind: "train" })}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const select = screen.getByLabelText("How") as HTMLSelectElement;
    expect(select.value).toBe("train");
  });

  it("renders a delete button in edit mode", () => {
    render(
      <TravelLegForm
        tripId="trip-1"
        leg={makeLeg()}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: /delete travel/i })
    ).toBeInTheDocument();
  });

  it("calls deleteTravelLeg with the leg id on delete", async () => {
    const onSuccess = vi.fn();
    mockDelete.mockResolvedValue({ ok: true });

    render(
      <TravelLegForm
        tripId="trip-1"
        leg={makeLeg({ id: "leg-99" })}
        onSuccess={onSuccess}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /delete travel/i }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("leg-99");
      expect(onSuccess).toHaveBeenCalledOnce();
    });
  });

  it("shows error on delete failure", async () => {
    mockDelete.mockResolvedValue({
      ok: false,
      errorKey: "travel_leg_delete_failed",
    });

    render(
      <TravelLegForm
        tripId="trip-1"
        leg={makeLeg()}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /delete travel/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("passes legId to upsertTravelLeg when editing", async () => {
    mockUpsert.mockResolvedValue({ ok: true, leg: makeLeg() });

    render(
      <TravelLegForm
        tripId="trip-1"
        leg={makeLeg({ id: "leg-42" })}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Save it" }));

    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ legId: "leg-42", tripId: "trip-1" }),
        expect.any(String)
      );
    });
  });

  it("pre-populates airlineIata and flightNumber from existing leg", () => {
    render(
      <TravelLegForm
        tripId="trip-1"
        leg={makeLeg({ airline_iata: "AA", flight_number: "1234" })}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // The AirlinePicker displays the selected airline name in the combobox
    const airlineInput = screen.getByRole("combobox", { name: /airline/i }) as HTMLInputElement;
    expect(airlineInput.value).toContain("American Airlines");

    const flightInput = screen.getByRole("textbox", { name: /flight number/i }) as HTMLInputElement;
    expect(flightInput.value).toBe("1234");
  });

  it("passes airlineIata and flightNumber to upsertTravelLeg on submit", async () => {
    mockUpsert.mockResolvedValue({ ok: true, leg: makeLeg() });

    render(
      <TravelLegForm
        tripId="trip-1"
        leg={makeLeg({ id: "leg-55", airline_iata: "DL", flight_number: "200" })}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Save it" }));

    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          airlineIata: "DL",
          flightNumber: "200",
        }),
        expect.any(String)
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Carrier / AirlinePicker mutual-exclusion (W1b fix)
// ---------------------------------------------------------------------------

describe("TravelLegForm — carrier vs AirlinePicker rendering", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("flight kind renders AirlinePicker and NOT the plain carrier text input", () => {
    render(
      <TravelLegForm
        tripId="trip-1"
        leg={makeLeg({ kind: "flight" })}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // AirlinePicker combobox must be present
    expect(screen.getByRole("combobox", { name: /airline/i })).toBeInTheDocument();
    // Plain carrier text input must NOT be present
    expect(screen.queryByLabelText("Carrier")).not.toBeInTheDocument();
  });

  it("drive kind renders plain carrier text input and NOT the AirlinePicker", () => {
    render(
      <TravelLegForm
        tripId="trip-1"
        leg={makeLeg({ kind: "drive" })}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // Plain carrier input must be present
    expect(screen.getByLabelText("Carrier")).toBeInTheDocument();
    // AirlinePicker combobox must NOT be present
    expect(screen.queryByRole("combobox", { name: /airline/i })).not.toBeInTheDocument();
  });

  it("train kind renders plain carrier text input and NOT the AirlinePicker", () => {
    render(
      <TravelLegForm
        tripId="trip-1"
        leg={makeLeg({ kind: "train" })}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Carrier")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /airline/i })).not.toBeInTheDocument();
  });

  it("other kind renders plain carrier text input and NOT the AirlinePicker", () => {
    render(
      <TravelLegForm
        tripId="trip-1"
        leg={makeLeg({ kind: "other" })}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Carrier")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /airline/i })).not.toBeInTheDocument();
  });

  it("add mode defaults to flight: shows AirlinePicker, not plain carrier input", () => {
    render(
      <TravelLegForm
        tripId="trip-1"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // Default kind is "flight"
    expect(screen.getByRole("combobox", { name: /airline/i })).toBeInTheDocument();
    expect(screen.queryByLabelText("Carrier")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// #248: cross-field guard — client clears airline fields when kind != flight
// ---------------------------------------------------------------------------
//
// Pre-#248: edit a flight leg (airlineIata="AA", flightNumber="1234"), switch
// the kind to "drive", click save — RHF retained the airline values in
// memory and posted them to the server. Server accepted them (no
// cross-field guard).
//
// The server now rejects this combination (#248 superRefine guard). The
// client clears the two airline fields in onSubmit so the server rejection
// is never reached in normal use — UX defense to keep the form from
// surfacing a "validation_failed" the user can't act on.

describe("TravelLegForm — kind switch clears airline fields on submit", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("nulls airlineIata + flightNumber when submitting with kind != flight", async () => {
    mockUpsert.mockResolvedValue({ ok: true, leg: makeLeg() });

    render(
      <TravelLegForm
        tripId="trip-1"
        leg={makeLeg({
          id: "leg-77",
          kind: "flight",
          airline_iata: "AA",
          flight_number: "1234",
        })}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // Switch kind off flight — the airline picker un-renders, but RHF
    // would otherwise still hold the stale airlineIata/flightNumber.
    fireEvent.change(screen.getByLabelText("How"), {
      target: { value: "drive" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save it" }));

    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "drive",
          airlineIata: null,
          flightNumber: null,
        }),
        expect.any(String)
      );
    });
  });

  it("preserves airlineIata + flightNumber when kind is still flight", async () => {
    mockUpsert.mockResolvedValue({ ok: true, leg: makeLeg() });

    render(
      <TravelLegForm
        tripId="trip-1"
        leg={makeLeg({
          id: "leg-78",
          kind: "flight",
          airline_iata: "AA",
          flight_number: "1234",
        })}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Save it" }));

    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "flight",
          airlineIata: "AA",
          flightNumber: "1234",
        }),
        expect.any(String)
      );
    });
  });
});
