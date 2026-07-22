/**
 * Unit tests for AnnouncementCardActions — organizer-only overflow menu
 * (#393). TDD: written before implementation (RED phase).
 */

import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AnnouncementCardActions } from "../announcement-card-actions";
import type { ErrorKey } from "@/lib/copy/errors";

function openMenu() {
  const trigger = screen.getByRole("button", { name: /post options/i });
  fireEvent.click(trigger);
}

describe("AnnouncementCardActions", () => {
  let onPinMock: ReturnType<
    typeof vi.fn<(pinned: boolean) => Promise<ErrorKey | null>>
  >;
  let onDeleteMock: ReturnType<typeof vi.fn<() => Promise<ErrorKey | null>>>;
  let onPin: (pinned: boolean) => Promise<ErrorKey | null>;
  let onDelete: () => Promise<ErrorKey | null>;

  beforeEach(() => {
    onPinMock = vi.fn<(pinned: boolean) => Promise<ErrorKey | null>>(
      async () => null
    );
    onDeleteMock = vi.fn<() => Promise<ErrorKey | null>>(async () => null);
    onPin = onPinMock;
    onDelete = onDeleteMock;
  });

  it("shows 'Pin' when not pinned", async () => {
    render(
      <AnnouncementCardActions pinned={false} onPin={onPin} onDelete={onDelete} />
    );
    openMenu();
    expect(await screen.findByRole("menuitem", { name: "Pin" })).toBeInTheDocument();
  });

  it("shows 'Unpin' when pinned", async () => {
    render(
      <AnnouncementCardActions pinned={true} onPin={onPin} onDelete={onDelete} />
    );
    openMenu();
    expect(
      await screen.findByRole("menuitem", { name: "Unpin" })
    ).toBeInTheDocument();
  });

  it("calls onPin with the desired end state (opposite of current)", async () => {
    render(
      <AnnouncementCardActions pinned={false} onPin={onPin} onDelete={onDelete} />
    );
    openMenu();
    const item = await screen.findByRole("menuitem", { name: "Pin" });
    fireEvent.click(item);
    expect(onPinMock).toHaveBeenCalledWith(true);
  });

  it("requires a second tap before calling onDelete (two-tap confirm)", async () => {
    render(
      <AnnouncementCardActions pinned={false} onPin={onPin} onDelete={onDelete} />
    );
    openMenu();
    const item = await screen.findByTestId("confirm-delete");
    fireEvent.click(item);
    expect(onDeleteMock).not.toHaveBeenCalled();

    // The label swaps to the confirm copy on the armed first tap.
    expect(screen.getByTestId("confirm-delete")).toHaveTextContent(
      /tap again/i
    );

    fireEvent.click(screen.getByTestId("confirm-delete"));
    expect(onDeleteMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces the returned error inline on a failed delete", async () => {
    onDeleteMock.mockResolvedValueOnce("announcement_delete_failed");
    render(
      <AnnouncementCardActions pinned={false} onPin={onPin} onDelete={onDelete} />
    );
    openMenu();
    const item = await screen.findByTestId("confirm-delete");
    fireEvent.click(item);
    fireEvent.click(screen.getByTestId("confirm-delete"));

    expect(
      await screen.findByRole("alert")
    ).toHaveTextContent(/couldn't take that one down/i);
  });

  it("surfaces the returned error inline on a failed pin toggle", async () => {
    onPinMock.mockResolvedValueOnce("announcement_pin_failed");
    render(
      <AnnouncementCardActions pinned={false} onPin={onPin} onDelete={onDelete} />
    );
    openMenu();
    const item = await screen.findByRole("menuitem", { name: "Pin" });
    fireEvent.click(item);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /didn't stick/i
    );
  });
});
