/**
 * Unit tests for TravelLegForm — #477 two-section model.
 *
 * A leg is inbound ("Getting there" — arrival required) or outbound
 * ("Heading home" — departure required). Each direction renders ONE time
 * field (its trip-city-side instant); edit mode derives the section from
 * `leg.direction`.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TravelLegForm } from "../travel-leg-form";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
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
  depart_at: null,
  arrive_at: "2026-08-14T10:30:00Z",
  carrier: "Southwest",
  confirmation_code: "ABC123",
  notes: "Window seat please",
  idempotency_key: null,
  created_at: "2026-05-20T00:00:00Z",
  airline_iata: null,
  flight_number: null,
  direction: "inbound",
  airport: null,
  origin_label: null,
  ...overrides,
});

describe("TravelLegForm — add mode (inbound)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the inbound field set: Arrive, Airport, kind, AirlinePicker, Coming from, confirmation, notes", () => {
    render(
      <TravelLegForm
        tripId="trip-1"
        direction="inbound"
        tripTimezone="UTC"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Arrive")).toBeInTheDocument();
    expect(screen.getByLabelText("Airport")).toBeInTheDocument();
    expect(screen.getByLabelText("How")).toBeInTheDocument();
    // Default kind is "flight" — AirlinePicker renders instead of plain carrier
    expect(
      screen.getByRole("combobox", { name: /airline/i })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Carrier")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Coming from")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirmation #")).toBeInTheDocument();
    expect(screen.getByLabelText("Notes")).toBeInTheDocument();
    // #477: inbound records ONLY the trip-city arrival — no Leave field
    expect(screen.queryByLabelText("Leave")).not.toBeInTheDocument();
  });

  it("renders kind options: Flight, Train, Drive, Other", () => {
    render(
      <TravelLegForm
        tripId="trip-1"
        direction="inbound"
        tripTimezone="UTC"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByRole("option", { name: "Flight" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Train" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Drive" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Other" })).toBeInTheDocument();
  });

  it("does not render the dead #382 tz caption", () => {
    render(
      <TravelLegForm
        tripId="trip-1"
        direction="inbound"
        tripTimezone="America/Los_Angeles"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // The "Times are Los Angeles time" disclosure died with the
    // two-section model — the one time you type IS a trip-city time.
    expect(screen.queryByText(/Times are .* time/)).not.toBeInTheDocument();
  });

  it("calls onCancel when cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(
      <TravelLegForm
        tripId="trip-1"
        direction="inbound"
        tripTimezone="UTC"
        onSuccess={vi.fn()}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("submits direction, tripId, kind, airport and originLabel", async () => {
    mockUpsert.mockResolvedValue({ ok: true, leg: makeLeg() });

    render(
      <TravelLegForm
        tripId="trip-1"
        direction="inbound"
        tripTimezone="UTC"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Arrive"), {
      target: { value: "2026-08-14T10:30" },
    });
    fireEvent.change(screen.getByLabelText("Airport"), {
      target: { value: "LAX" },
    });
    fireEvent.change(screen.getByLabelText("Coming from"), {
      target: { value: "JFK" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save it" }));

    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          tripId: "trip-1",
          kind: "flight",
          direction: "inbound",
          airport: "LAX",
          originLabel: "JFK",
          arriveAt: "2026-08-14T10:30:00.000Z",
          departAt: null,
        }),
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
        direction="inbound"
        tripTimezone="UTC"
        onSuccess={onSuccess}
        onCancel={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Arrive"), {
      target: { value: "2026-08-14T10:30" },
    });
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
        direction="inbound"
        tripTimezone="UTC"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Arrive"), {
      target: { value: "2026-08-14T10:30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save it" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("does not render a delete button in add mode", () => {
    render(
      <TravelLegForm
        tripId="trip-1"
        direction="inbound"
        tripTimezone="UTC"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(
      screen.queryByRole("button", { name: /delete/i })
    ).not.toBeInTheDocument();
  });
});

describe("TravelLegForm — add mode (outbound)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders Leave but neither Arrive nor Coming from (#477 originLabel is inbound-only)", () => {
    render(
      <TravelLegForm
        tripId="trip-1"
        direction="outbound"
        tripTimezone="UTC"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Leave")).toBeInTheDocument();
    expect(screen.queryByLabelText("Arrive")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Coming from")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Airport")).toBeInTheDocument();
  });

  it("submits direction outbound with departAt and a null arriveAt", async () => {
    mockUpsert.mockResolvedValue({
      ok: true,
      leg: makeLeg({ direction: "outbound" }),
    });

    render(
      <TravelLegForm
        tripId="trip-1"
        direction="outbound"
        tripTimezone="UTC"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("Leave"), {
      target: { value: "2026-08-16T08:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save it" }));

    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: "outbound",
          departAt: "2026-08-16T08:00:00.000Z",
          arriveAt: null,
          originLabel: null,
        }),
        expect.any(String)
      );
    });
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
        tripTimezone="UTC"
        leg={makeLeg({ kind: "train", airport: "LAX", origin_label: "Ohio" })}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const carrierInput = screen.getByLabelText("Carrier") as HTMLInputElement;
    expect(carrierInput.value).toBe("Southwest");

    const confirmationInput = screen.getByLabelText(
      "Confirmation #"
    ) as HTMLInputElement;
    expect(confirmationInput.value).toBe("ABC123");

    expect((screen.getByLabelText("Airport") as HTMLInputElement).value).toBe(
      "LAX"
    );
    expect(
      (screen.getByLabelText("Coming from") as HTMLInputElement).value
    ).toBe("Ohio");
  });

  it("derives the inbound section from leg.direction — Arrive field, no Leave", () => {
    render(
      <TravelLegForm
        tripId="trip-1"
        tripTimezone="UTC"
        leg={makeLeg({ direction: "inbound" })}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Arrive")).toBeInTheDocument();
    expect(screen.queryByLabelText("Leave")).not.toBeInTheDocument();
  });

  it("derives the outbound section from leg.direction — Leave field, no Arrive, even if the CTA direction prop disagrees", () => {
    render(
      <TravelLegForm
        tripId="trip-1"
        tripTimezone="UTC"
        // direction prop must lose to leg.direction in edit mode
        direction="inbound"
        leg={makeLeg({
          direction: "outbound",
          depart_at: "2026-08-16T08:00:00Z",
          arrive_at: null,
        })}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Leave")).toBeInTheDocument();
    expect(screen.queryByLabelText("Arrive")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Coming from")).not.toBeInTheDocument();
  });

  it("pre-populates kind select from the existing leg", () => {
    render(
      <TravelLegForm
        tripId="trip-1"
        tripTimezone="UTC"
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
        tripTimezone="UTC"
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
        tripTimezone="UTC"
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
        tripTimezone="UTC"
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
        tripTimezone="UTC"
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

  it("editing a legacy inbound leg that carried both times nulls the vestigial depart_at", async () => {
    // #477: legacy rows were backfilled inbound and may hold both
    // instants — an inbound save writes ONLY the arrival.
    mockUpsert.mockResolvedValue({ ok: true, leg: makeLeg() });

    render(
      <TravelLegForm
        tripId="trip-1"
        tripTimezone="UTC"
        leg={makeLeg({
          depart_at: "2026-08-14T06:00:00Z",
          arrive_at: "2026-08-14T10:30:00Z",
        })}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Save it" }));

    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: "inbound",
          arriveAt: "2026-08-14T10:30:00.000Z",
          departAt: null,
        }),
        expect.any(String)
      );
    });
  });

  it("pre-populates airlineIata and flightNumber from existing leg", () => {
    render(
      <TravelLegForm
        tripId="trip-1"
        tripTimezone="UTC"
        leg={makeLeg({ airline_iata: "AA", flight_number: "1234" })}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    const airlineInput = screen.getByRole("combobox", {
      name: /airline/i,
    }) as HTMLInputElement;
    expect(airlineInput.value).toContain("American Airlines");

    const flightInput = screen.getByRole("textbox", {
      name: /flight number/i,
    }) as HTMLInputElement;
    expect(flightInput.value).toBe("1234");
  });

  it("passes airlineIata and flightNumber to upsertTravelLeg on submit", async () => {
    mockUpsert.mockResolvedValue({ ok: true, leg: makeLeg() });

    render(
      <TravelLegForm
        tripId="trip-1"
        tripTimezone="UTC"
        leg={makeLeg({
          id: "leg-55",
          airline_iata: "DL",
          flight_number: "200",
        })}
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
        tripTimezone="UTC"
        leg={makeLeg({ kind: "flight" })}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(
      screen.getByRole("combobox", { name: /airline/i })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Carrier")).not.toBeInTheDocument();
  });

  it("drive kind renders plain carrier text input and NOT the AirlinePicker", () => {
    render(
      <TravelLegForm
        tripId="trip-1"
        tripTimezone="UTC"
        leg={makeLeg({ kind: "drive" })}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Carrier")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /airline/i })
    ).not.toBeInTheDocument();
  });

  it("train kind renders plain carrier text input and NOT the AirlinePicker", () => {
    render(
      <TravelLegForm
        tripId="trip-1"
        tripTimezone="UTC"
        leg={makeLeg({ kind: "train" })}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Carrier")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /airline/i })
    ).not.toBeInTheDocument();
  });

  it("other kind renders plain carrier text input and NOT the AirlinePicker", () => {
    render(
      <TravelLegForm
        tripId="trip-1"
        tripTimezone="UTC"
        leg={makeLeg({ kind: "other" })}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(screen.getByLabelText("Carrier")).toBeInTheDocument();
    expect(
      screen.queryByRole("combobox", { name: /airline/i })
    ).not.toBeInTheDocument();
  });

  it("add mode defaults to flight: shows AirlinePicker, not plain carrier input", () => {
    render(
      <TravelLegForm
        tripId="trip-1"
        direction="inbound"
        tripTimezone="UTC"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect(
      screen.getByRole("combobox", { name: /airline/i })
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Carrier")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// #248: cross-field guard — client clears airline fields when kind != flight
// ---------------------------------------------------------------------------

describe("TravelLegForm — kind switch clears airline fields on submit", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("nulls airlineIata + flightNumber when submitting with kind != flight", async () => {
    mockUpsert.mockResolvedValue({ ok: true, leg: makeLeg() });

    render(
      <TravelLegForm
        tripId="trip-1"
        tripTimezone="UTC"
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

  it("self-heals: editing a non-flight leg that has stale airline data nulls them on save", async () => {
    mockUpsert.mockResolvedValue({ ok: true, leg: makeLeg() });

    render(
      <TravelLegForm
        tripId="trip-1"
        tripTimezone="UTC"
        leg={makeLeg({
          id: "leg-99",
          kind: "drive",
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
        tripTimezone="UTC"
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

// ---------------------------------------------------------------------------
// #382: trip-TZ datetime contract — the form parses and renders the time
// field as wall-clock time in the TRIP's timezone, never the device's.
// Under #477 that is also the airline convention's clock for the one
// instant each direction records.
// ---------------------------------------------------------------------------

describe("TravelLegForm — trip-TZ datetime contract (#382)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("pre-populates Arrive as trip-local wall clock, not device-local", () => {
    vi.stubEnv("TZ", "America/New_York"); // off-TZ device
    render(
      <TravelLegForm
        tripId="trip-1"
        tripTimezone="America/Los_Angeles"
        leg={makeLeg({
          arrive_at: "2026-08-01T21:30:00Z", // 14:30 PDT
        })}
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    expect((screen.getByLabelText("Arrive") as HTMLInputElement).value).toBe(
      "2026-08-01T14:30"
    );
  });

  it("submits a typed wall-clock time as a trip-TZ instant (EDT-device round-trip)", async () => {
    vi.stubEnv("TZ", "America/New_York");
    mockUpsert.mockResolvedValue({ ok: true, leg: makeLeg() });

    render(
      <TravelLegForm
        tripId="trip-1"
        direction="inbound"
        tripTimezone="America/Los_Angeles"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // Types the arrival straight off the boarding pass — trip-local 10:45.
    fireEvent.change(screen.getByLabelText("Arrive"), {
      target: { value: "2026-08-01T10:45" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save it" }));

    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledWith(
        // 10:45 PDT = 17:45 UTC. The buggy device-TZ parse gave 14:45 UTC.
        expect.objectContaining({ arriveAt: "2026-08-01T17:45:00.000Z" }),
        expect.any(String)
      );
    });
  });
});

// ---------------------------------------------------------------------------
// #477: client time validation — inbound needs the arrival, outbound
// needs the departure. Mirrors the server refine for inline UX.
// ---------------------------------------------------------------------------

describe("TravelLegForm — required time per direction (#477)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // restoreAllMocks doesn't clear call history on module-mock fns, and
    // this block asserts exact call counts — reset explicitly.
    mockUpsert.mockReset();
  });

  const renderAddForm = (direction: "inbound" | "outbound") =>
    render(
      <TravelLegForm
        tripId="trip-1"
        direction={direction}
        tripTimezone="UTC"
        onSuccess={vi.fn()}
        onCancel={vi.fn()}
      />
    );

  it("blocks an inbound submit without an arrival time", async () => {
    mockUpsert.mockResolvedValue({ ok: true, leg: makeLeg() });
    renderAddForm("inbound");

    fireEvent.click(screen.getByRole("button", { name: "Save it" }));

    expect(
      await screen.findByText(M3_UI_STRINGS.arrivals_leg_form_arrive_required)
    ).toBeInTheDocument();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("blocks an outbound submit without a departure time", async () => {
    mockUpsert.mockResolvedValue({ ok: true, leg: makeLeg() });
    renderAddForm("outbound");

    fireEvent.click(screen.getByRole("button", { name: "Save it" }));

    expect(
      await screen.findByText(M3_UI_STRINGS.arrivals_leg_form_depart_required)
    ).toBeInTheDocument();
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("submits an inbound leg once the arrival is filled", async () => {
    mockUpsert.mockResolvedValue({ ok: true, leg: makeLeg() });
    renderAddForm("inbound");

    fireEvent.change(screen.getByLabelText("Arrive"), {
      target: { value: "2026-08-14T20:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save it" }));

    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledOnce();
    });
  });

  it("clears the message once a valid time fixes the form", async () => {
    mockUpsert.mockResolvedValue({ ok: true, leg: makeLeg() });
    renderAddForm("inbound");

    fireEvent.click(screen.getByRole("button", { name: "Save it" }));
    expect(
      await screen.findByText(M3_UI_STRINGS.arrivals_leg_form_arrive_required)
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Arrive"), {
      target: { value: "2026-08-14T20:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save it" }));

    await waitFor(() => {
      expect(mockUpsert).toHaveBeenCalledOnce();
    });
    expect(
      screen.queryByText(M3_UI_STRINGS.arrivals_leg_form_arrive_required)
    ).not.toBeInTheDocument();
  });
});
