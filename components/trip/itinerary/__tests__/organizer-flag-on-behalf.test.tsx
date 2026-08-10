/**
 * #171 — OrganizerFlagOnBehalf tests. The organizer-side entry that
 * transcribes a heads-up for another member (attributed, member confirms).
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import { OrganizerFlagOnBehalf } from "../organizer-flag-on-behalf";
import type { TripMember } from "@/lib/db/types";

vi.mock("@/lib/actions/item-flags", () => ({
  addItemFlagOnBehalf: vi.fn(),
}));

import { addItemFlagOnBehalf } from "@/lib/actions/item-flags";

const mockOnBehalf = vi.mocked(addItemFlagOnBehalf);

const ITEM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VIEWER_ID = "org-self";

const makeMember = (o: Partial<TripMember> = {}): TripMember => ({
  id: "m",
  trip_id: "trip-1",
  user_id: "u",
  role: "attendee",
  rsvp_status: "going",
  joined_at: "2026-05-20T00:00:00Z",
  is_celebrant: false,
  display_name: null,
  phone_e164: null,
  email: null,
  idempotency_key: null,
  ...o,
});

const members: TripMember[] = [
  makeMember({ id: VIEWER_ID, display_name: "You", role: "organizer" }),
  makeMember({ id: "m-zack", display_name: "Zack", user_id: "u-z" }),
  makeMember({ id: "m-alex", display_name: "Alex", user_id: "u-a" }),
  makeMember({
    id: "m-dee",
    display_name: "Dee",
    user_id: "u-d",
    rsvp_status: "declined",
  }),
];

function open() {
  render(
    <OrganizerFlagOnBehalf
      itemId={ITEM_ID}
      tripMembers={members}
      viewerMemberId={VIEWER_ID}
    />
  );
  fireEvent.click(
    screen.getByRole("button", {
      name: M3_UI_STRINGS.itinerary_item_flag_onbehalf_add_trigger,
    })
  );
}

describe("OrganizerFlagOnBehalf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnBehalf.mockResolvedValue({ ok: true });
  });

  it("renders the disclosure trigger", () => {
    render(
      <OrganizerFlagOnBehalf
        itemId={ITEM_ID}
        tripMembers={members}
        viewerMemberId={VIEWER_ID}
      />
    );
    expect(
      screen.getByRole("button", {
        name: M3_UI_STRINGS.itinerary_item_flag_onbehalf_add_trigger,
      })
    ).toBeInTheDocument();
  });

  it("excludes the organizer themselves and decliners, sorted alphabetically", () => {
    open();
    const options = screen
      .getAllByRole("option")
      .map((o) => o.textContent)
      .filter((t) => t && !t.startsWith("—")); // drop the placeholder
    expect(options).toEqual(["Alex", "Zack"]); // no "You", no declined "Dee"
  });

  it("submits addItemFlagOnBehalf with the target, flag and note", async () => {
    open();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "m-alex" },
    });
    fireEvent.change(
      screen.getByPlaceholderText(M3_UI_STRINGS.itinerary_item_flag_placeholder),
      { target: { value: "Shellfish" } }
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: M3_UI_STRINGS.itinerary_item_flag_onbehalf_save,
      })
    );
    await waitFor(() =>
      expect(mockOnBehalf).toHaveBeenCalledWith({
        itemId: ITEM_ID,
        targetTripMemberId: "m-alex",
        flag: "Shellfish",
        note: null,
      })
    );
  });

  it("shows the 'saved for {name}' confirmation on success", async () => {
    open();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "m-alex" },
    });
    fireEvent.change(
      screen.getByPlaceholderText(M3_UI_STRINGS.itinerary_item_flag_placeholder),
      { target: { value: "Shellfish" } }
    );
    fireEvent.click(
      screen.getByRole("button", {
        name: M3_UI_STRINGS.itinerary_item_flag_onbehalf_save,
      })
    );
    await waitFor(() =>
      expect(screen.getByText(/Saved for Alex\./i)).toBeInTheDocument()
    );
    expect(screen.getByText(/They'll get the final say\./i)).toBeInTheDocument();
  });

  it("renders nothing when the only member is the organizer", () => {
    const { container } = render(
      <OrganizerFlagOnBehalf
        itemId={ITEM_ID}
        tripMembers={[members[0]]}
        viewerMemberId={VIEWER_ID}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
