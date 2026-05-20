/**
 * Tests for `components/trip/pulse-poll.tsx`.
 *
 * The component is generic and reusable; the date-poll page is the
 * first consumer. We exercise the realtime + reconnect contract
 * (Appendix A.3 of `notes/m2-execution-plan.md`) against a hand-
 * rolled Supabase channel fake:
 *
 *   1. Initial paint uses `initialData`
 *   2. A `postgres_changes` event triggers a refetch
 *   3. CLOSED → SUBSCRIBED triggers a single post-reconnect refetch
 *   4. Unmount tears down the channel
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { PulsePoll } from "@/components/trip/pulse-poll";

interface FakeChannel {
  // Map event names → list of (filterConfig, handler) tuples.
  onCalls: Array<{ event: string; filter: unknown; handler: () => void }>;
  subscribeCallback: ((status: string) => void) | null;
  triggerChange: () => void;
  triggerStatus: (status: string) => void;
}

function buildFakeChannel(): FakeChannel {
  const ch: FakeChannel = {
    onCalls: [],
    subscribeCallback: null,
    triggerChange: () => {
      for (const c of ch.onCalls) c.handler();
    },
    triggerStatus: (s) => {
      ch.subscribeCallback?.(s);
    },
  };
  return ch;
}

function buildFakeClient(channel: FakeChannel) {
  // Supabase channel shape — only the methods PulsePoll touches.
  const channelObj = {
    on: vi.fn((event: string, filter: unknown, handler: () => void) => {
      channel.onCalls.push({ event, filter, handler });
      return channelObj;
    }),
    subscribe: vi.fn((cb: (status: string) => void) => {
      channel.subscribeCallback = cb;
      // Simulate the channel hitting SUBSCRIBED synchronously after
      // .subscribe so the post-mount reconnect detection has the
      // correct initial state.
      Promise.resolve().then(() => cb("SUBSCRIBED"));
      return channelObj;
    }),
  };
  return {
    channel: vi.fn(() => channelObj),
    removeChannel: vi.fn(),
  };
}

describe("<PulsePoll />", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders initial data on first paint", () => {
    const ch = buildFakeChannel();
    const client = buildFakeClient(ch);
    render(
      <PulsePoll<string>
        channelKey="k"
        initialData="initial"
        fetchData={async () => "updated"}
        subscribeTableConfig={[{ table: "t1" }]}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        __supabaseClient={client as any}
        render={(d) => <span data-testid="payload">{d}</span>}
      />
    );
    expect(screen.getByTestId("payload").textContent).toBe("initial");
  });

  it("refetches and re-renders when a postgres_changes event fires", async () => {
    const ch = buildFakeChannel();
    const client = buildFakeClient(ch);
    const fetchData = vi.fn(async () => "v2");
    render(
      <PulsePoll<string>
        channelKey="k"
        initialData="v1"
        fetchData={fetchData}
        subscribeTableConfig={[{ table: "t1" }]}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        __supabaseClient={client as any}
        render={(d) => <span data-testid="payload">{d}</span>}
      />
    );
    expect(screen.getByTestId("payload").textContent).toBe("v1");

    await act(async () => {
      ch.triggerChange();
    });

    await waitFor(() => {
      expect(screen.getByTestId("payload").textContent).toBe("v2");
    });
    expect(fetchData).toHaveBeenCalled();
  });

  it("after CLOSED → SUBSCRIBED, refetches once to pick up missed changes", async () => {
    const ch = buildFakeChannel();
    const client = buildFakeClient(ch);
    const fetchData = vi.fn(async () => "v2");
    render(
      <PulsePoll<string>
        channelKey="k"
        initialData="v1"
        fetchData={fetchData}
        subscribeTableConfig={[{ table: "t1" }]}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        __supabaseClient={client as any}
        render={(d, isStale) => (
          <span data-testid="payload">
            {d}|{isStale ? "stale" : "fresh"}
          </span>
        )}
      />
    );

    // Wait for the initial SUBSCRIBED event to land (no-op refetch — the
    // first-ever subscribe is not a reconnect).
    await waitFor(() => {
      expect(screen.getByTestId("payload").textContent).toBe("v1|fresh");
    });
    expect(fetchData).not.toHaveBeenCalled();

    // Now simulate the channel going down and coming back up.
    await act(async () => {
      ch.triggerStatus("CLOSED");
    });
    await waitFor(() => {
      expect(screen.getByTestId("payload").textContent).toContain("stale");
    });

    await act(async () => {
      ch.triggerStatus("SUBSCRIBED");
    });

    await waitFor(() => {
      expect(screen.getByTestId("payload").textContent).toBe("v2|fresh");
    });
    expect(fetchData).toHaveBeenCalledTimes(1);
  });

  it("subscribes to every table in subscribeTableConfig", () => {
    const ch = buildFakeChannel();
    const client = buildFakeClient(ch);
    render(
      <PulsePoll<string>
        channelKey="k"
        initialData="v"
        fetchData={async () => "v"}
        subscribeTableConfig={[
          { table: "t1", filter: "trip_id=eq.abc" },
          { table: "t2" },
          { table: "t3" },
        ]}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        __supabaseClient={client as any}
        render={(d) => <span>{d}</span>}
      />
    );
    // Each subscribeTableConfig entry should register one .on() call.
    expect(ch.onCalls).toHaveLength(3);
    expect(
      (ch.onCalls[0]?.filter as { table: string }).table
    ).toBe("t1");
    expect(
      (ch.onCalls[0]?.filter as { filter?: string }).filter
    ).toBe("trip_id=eq.abc");
    expect(
      (ch.onCalls[1]?.filter as { table: string }).table
    ).toBe("t2");
  });

  it("does not rebuild the channel when subscribeTableConfig is a new-but-equivalent array", async () => {
    // Defensive contract: even if the caller fails to wrap
    // subscribeTableConfig in useMemo, the hash-stable internal key
    // keeps the channel intact. We re-render with a brand-new array
    // literal carrying the same payload and assert removeChannel was
    // NOT called.
    const ch = buildFakeChannel();
    const client = buildFakeClient(ch);
    const fetchData = vi.fn(async () => "v");
    const { rerender } = render(
      <PulsePoll<string>
        channelKey="k"
        initialData="v"
        fetchData={fetchData}
        subscribeTableConfig={[{ table: "t1" }]}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        __supabaseClient={client as any}
        render={(d) => <span>{d}</span>}
      />
    );
    expect(client.channel).toHaveBeenCalledTimes(1);
    expect(client.removeChannel).not.toHaveBeenCalled();

    // New array, identical content — should NOT trigger a teardown.
    rerender(
      <PulsePoll<string>
        channelKey="k"
        initialData="v"
        fetchData={fetchData}
        subscribeTableConfig={[{ table: "t1" }]}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        __supabaseClient={client as any}
        render={(d) => <span>{d}</span>}
      />
    );
    expect(client.channel).toHaveBeenCalledTimes(1);
    expect(client.removeChannel).not.toHaveBeenCalled();
  });

  it("calls removeChannel on unmount", () => {
    const ch = buildFakeChannel();
    const client = buildFakeClient(ch);
    const { unmount } = render(
      <PulsePoll<string>
        channelKey="k"
        initialData="v"
        fetchData={async () => "v"}
        subscribeTableConfig={[{ table: "t1" }]}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        __supabaseClient={client as any}
        render={(d) => <span>{d}</span>}
      />
    );
    unmount();
    expect(client.removeChannel).toHaveBeenCalled();
  });
});
