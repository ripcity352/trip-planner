/**
 * Unit tests for PollComposer (#390) — organizer-only poll form.
 * TDD: written before implementation (RED phase).
 */

import "@testing-library/jest-dom/vitest";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/actions/polls", () => ({
  createPollAction: vi.fn(),
}));

// Mock the shadcn Select with a native <select> so jsdom can interact
// with it (same shim as the announcement-composer tests).
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <select
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      data-testid="visibility-select"
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <option value={value}>{children}</option>,
}));

import { createPollAction } from "@/lib/actions/polls";
import { PollComposer } from "../poll-composer";
import { M5_UI_STRINGS } from "@/lib/copy/empty-states";

const mockCreate = vi.mocked(createPollAction);

describe("PollComposer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({ ok: true, pollId: "poll-1" });
  });

  it("renders nothing for non-organizers", () => {
    const { container } = render(
      <PollComposer tripId="trip-1" isOrganizer={false} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("starts collapsed as the composer affordance and expands on tap", () => {
    render(<PollComposer tripId="trip-1" isOrganizer />);
    const cta = screen.getByRole("button", {
      name: M5_UI_STRINGS.polls_composer_cta,
    });
    expect(
      screen.queryByLabelText(M5_UI_STRINGS.pollsForm_question_label)
    ).not.toBeInTheDocument();
    fireEvent.click(cta);
    expect(
      screen.getByLabelText(M5_UI_STRINGS.pollsForm_question_label)
    ).toBeInTheDocument();
  });

  it("submits question + options + visibility and reports success", async () => {
    const onCreated = vi.fn();
    render(<PollComposer tripId="trip-1" isOrganizer onCreated={onCreated} />);
    fireEvent.click(
      screen.getByRole("button", { name: M5_UI_STRINGS.polls_composer_cta })
    );

    fireEvent.change(
      screen.getByLabelText(M5_UI_STRINGS.pollsForm_question_label),
      { target: { value: "Steakhouse or omakase?" } }
    );
    const optionInputs = screen.getAllByLabelText(/Option \d/);
    expect(optionInputs).toHaveLength(2);
    fireEvent.change(optionInputs[0] as HTMLElement, {
      target: { value: "Steakhouse" },
    });
    fireEvent.change(optionInputs[1] as HTMLElement, {
      target: { value: "Omakase" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: M5_UI_STRINGS.pollsForm_submit })
    );

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));
    const [input, idempotencyKey] = mockCreate.mock.calls[0] as [
      {
        tripId: string;
        question: string;
        options: string[];
        visibility: string;
      },
      string,
    ];
    expect(input.tripId).toBe("trip-1");
    expect(input.question).toBe("Steakhouse or omakase?");
    expect(input.options).toEqual(["Steakhouse", "Omakase"]);
    expect(input.visibility).toBe("everyone");
    expect(idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("adds option fields up to four, then hides the affordance", () => {
    render(<PollComposer tripId="trip-1" isOrganizer />);
    fireEvent.click(
      screen.getByRole("button", { name: M5_UI_STRINGS.polls_composer_cta })
    );
    const addButton = () =>
      screen.queryByRole("button", {
        name: M5_UI_STRINGS.pollsForm_add_option,
      });

    expect(screen.getAllByLabelText(/Option \d/)).toHaveLength(2);
    fireEvent.click(addButton() as HTMLElement);
    expect(screen.getAllByLabelText(/Option \d/)).toHaveLength(3);
    fireEvent.click(addButton() as HTMLElement);
    expect(screen.getAllByLabelText(/Option \d/)).toHaveLength(4);
    // 2–4 scope fence: no fifth option
    expect(addButton()).not.toBeInTheDocument();
  });

  it("shows the error copy when the action fails", async () => {
    mockCreate.mockResolvedValue({
      ok: false,
      errorKey: "poll_create_failed",
    });
    render(<PollComposer tripId="trip-1" isOrganizer />);
    fireEvent.click(
      screen.getByRole("button", { name: M5_UI_STRINGS.polls_composer_cta })
    );
    fireEvent.change(
      screen.getByLabelText(M5_UI_STRINGS.pollsForm_question_label),
      { target: { value: "Q?" } }
    );
    const optionInputs = screen.getAllByLabelText(/Option \d/);
    fireEvent.change(optionInputs[0] as HTMLElement, {
      target: { value: "A" },
    });
    fireEvent.change(optionInputs[1] as HTMLElement, {
      target: { value: "B" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: M5_UI_STRINGS.pollsForm_submit })
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toBeInTheDocument()
    );
  });
});
