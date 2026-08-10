/**
 * Unit tests for CrewFlightPanel (#574 follow-up) — the collapsible shell
 * around CrewFlightForm. Covers the "hide when there's no one but you to log
 * for" guard and the open/close toggle.
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { CrewFlightPanel } from "../crew-flight-panel";
import { M3_UI_STRINGS } from "@/lib/copy/empty-states";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

// The form is exercised in its own test; stub it so the panel test is focused.
vi.mock("../crew-flight-form", () => ({
  CrewFlightForm: () => <div data-testid="crew-flight-form" />,
}));

const base = {
  tripId: "trip-1",
  tripTimezone: "UTC",
  viewerTripMemberId: "member-1",
};

describe("CrewFlightPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders nothing when the only candidate is the viewer", () => {
    const { container } = render(
      <CrewFlightPanel
        {...base}
        candidates={[{ id: "member-1", name: "Dave", isYou: true }]}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there are no candidates", () => {
    const { container } = render(<CrewFlightPanel {...base} candidates={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the trigger when there's at least one other passenger", () => {
    render(
      <CrewFlightPanel
        {...base}
        candidates={[
          { id: "member-1", name: "Dave", isYou: true },
          { id: "member-2", name: "Rob", isYou: false },
        ]}
      />
    );
    expect(
      screen.getByRole("button", { name: M3_UI_STRINGS.crewFlight_trigger })
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("crew-flight-form")).not.toBeInTheDocument();
  });

  it("expands the form on trigger click", () => {
    render(
      <CrewFlightPanel
        {...base}
        candidates={[
          { id: "member-1", name: "Dave", isYou: true },
          { id: "member-2", name: "Rob", isYou: false },
        ]}
      />
    );
    fireEvent.click(
      screen.getByRole("button", { name: M3_UI_STRINGS.crewFlight_trigger })
    );
    expect(screen.getByTestId("crew-flight-form")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: M3_UI_STRINGS.crewFlight_trigger })
    ).toHaveAttribute("aria-expanded", "true");
  });
});
