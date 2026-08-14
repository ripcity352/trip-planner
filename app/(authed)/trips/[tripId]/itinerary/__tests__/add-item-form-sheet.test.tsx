/**
 * Unit tests for AddItemFormSheet — client shell that toggles AddItemForm.
 *
 * Any-member-can-add: the sheet renders for every viewer (page.tsx no
 * longer gates it on isOrganizer); this test locks that the sheet always
 * mounts and forwards isOrganizer through to AddItemForm so the visibility
 * picker inside it is gated correctly (AddItemForm's own tests cover the
 * picker-hiding behavior).
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AddItemFormSheet } from "../add-item-form-sheet";

const useRouterMock = vi.fn(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => useRouterMock(),
}));

vi.mock("@/components/trip/itinerary/add-item-form", () => ({
  AddItemForm: ({ isOrganizer }: { isOrganizer?: boolean }) => (
    <div data-testid="add-item-form" data-is-organizer={String(!!isOrganizer)}>
      form
    </div>
  ),
}));

describe("AddItemFormSheet", () => {
  const baseProps = {
    tripId: "trip-1",
    tripTimezone: "America/New_York",
  };

  it("renders the add-item CTA regardless of isOrganizer", () => {
    render(<AddItemFormSheet {...baseProps} isOrganizer={false} />);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("mounts AddItemForm with isOrganizer=true for an organizer", () => {
    render(<AddItemFormSheet {...baseProps} isOrganizer={true} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("add-item-form")).toHaveAttribute(
      "data-is-organizer",
      "true"
    );
  });

  it("mounts AddItemForm with isOrganizer=false for a plain member", () => {
    render(<AddItemFormSheet {...baseProps} isOrganizer={false} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByTestId("add-item-form")).toHaveAttribute(
      "data-is-organizer",
      "false"
    );
  });
});
