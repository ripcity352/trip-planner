/**
 * Tests for `lib/db/poll-comments.ts` (#620, part 1/3 of #616).
 *
 * Tests:
 *   1. `POLL_COMMENT_COLUMNS` — scalar author_trip_member_id (no embed),
 *      every PollComment read column present.
 *   2. `getPollComments` — orders created_at ASC, scoped to one poll,
 *      empty/null data, throws on Supabase error.
 *   3. `getCommentsForTrip` — same shape, scoped to a trip.
 *   4. `enrichPollComments` — the "Someone" author-fallback resolver: a
 *      present member resolves to their display name; a null or
 *      map-missing author resolves to
 *      M3_UI_STRINGS.announcements_author_fallback ("Someone"), never
 *      "Guest" (roster_member_fallback_name).
 *   5. `deleteComment` — exact-count delete, POLL_COMMENT_NO_ROW on a
 *      zero-row match, error.code preserved on failure.
 */

import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { M3_UI_STRINGS } from "@/lib/copy/empty-states";
import {
  POLL_COMMENT_COLUMNS,
  POLL_COMMENT_NO_ROW,
  PollCommentDbError,
  deleteComment,
  enrichPollComments,
  getCommentsForTrip,
  getPollComments,
} from "../poll-comments";
import type { PollComment } from "../types";

// ---------------------------------------------------------------------------
// Query mock (cloned from shopping-item-comments.test.ts)
// ---------------------------------------------------------------------------

function makeClient(
  tableResolvers: Record<string, () => { data: unknown; error: unknown }>
) {
  const buildProxy = (tableName: string): Record<string, unknown> => {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const thenable: PromiseLike<{ data: unknown; error: unknown }> = {
      then(onfulfilled) {
        const result = tableResolvers[tableName]?.() ?? {
          data: [],
          error: null,
        };
        return Promise.resolve(result).then(onfulfilled);
      },
    };
    const handler: ProxyHandler<Record<string, unknown>> = {
      get(_target, prop: string) {
        if (prop === "then") return thenable.then.bind(thenable);
        if (prop === "__calls") return calls;
        return (...args: unknown[]) => {
          calls.push({ method: prop, args });
          return proxy;
        };
      },
    };
    const proxy: Record<string, unknown> = new Proxy({}, handler);
    return proxy;
  };

  const proxies: Record<string, Record<string, unknown>> = {};
  const from = vi.fn((table: string) => {
    proxies[table] = proxies[table] ?? buildProxy(table);
    return proxies[table];
  });

  return { from } as unknown as SupabaseClient;
}

/**
 * Fluent-builder mock that carries `count` for the exact-count delete
 * (mirrors shopping-item-comments.test.ts's makeSequencedBuilder).
 */
function makeSequencedBuilder(
  responses: Array<{ data: unknown; error: unknown; count?: number | null }>
) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const queue = [...responses];

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (prop === "then") {
        const next = queue.shift() ?? { data: null, error: null };
        const p = Promise.resolve(next);
        return p.then.bind(p);
      }
      return (...args: unknown[]) => {
        calls.push({ method: prop, args });
        return proxy;
      };
    },
  };
  const proxy: Record<string, unknown> = new Proxy({}, handler);

  return { calls, client: { from: vi.fn(() => proxy) } };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TRIP_ID = "11111111-1111-4111-8111-111111111111";
const POLL_ID = "99999999-9999-4999-8999-999999999999";
const MEMBER_ID = "22222222-2222-4222-8222-222222222222";

const mockComment: PollComment = {
  id: "comment-1",
  poll_id: POLL_ID,
  trip_id: TRIP_ID,
  author_trip_member_id: MEMBER_ID,
  body: "Omakase, obviously.",
  idempotency_key: null,
  created_at: "2026-08-13T10:00:00.000Z",
};

// ---------------------------------------------------------------------------
// POLL_COMMENT_COLUMNS
// ---------------------------------------------------------------------------

describe("POLL_COMMENT_COLUMNS", () => {
  it("includes every PollComment DB column, scalar (no embed)", () => {
    const columns = POLL_COMMENT_COLUMNS.split(",").map((c) => c.trim());
    const expectedColumns = [
      "id",
      "poll_id",
      "trip_id",
      "author_trip_member_id",
      "body",
      "idempotency_key",
      "created_at",
    ];
    for (const col of expectedColumns) {
      expect(columns).toContain(col);
    }
    // No embed syntax (parens indicate a PostgREST nested-select join)
    expect(POLL_COMMENT_COLUMNS).not.toContain("(");
  });
});

// ---------------------------------------------------------------------------
// getPollComments
// ---------------------------------------------------------------------------

describe("getPollComments", () => {
  it("returns comments on success", async () => {
    const client = makeClient({
      poll_comments: () => ({ data: [mockComment], error: null }),
    });
    const result = await getPollComments(client, POLL_ID);
    expect(result).toHaveLength(1);
    expect(result[0].body).toBe("Omakase, obviously.");
  });

  it("orders by created_at ascending (flat thread, oldest first) and scopes by poll_id", async () => {
    const { calls, client } = makeSequencedBuilder([
      { data: [mockComment], error: null },
    ]);

    await getPollComments(client as unknown as SupabaseClient, POLL_ID);

    expect(calls.find((c) => c.method === "eq")?.args).toEqual([
      "poll_id",
      POLL_ID,
    ]);
    expect(calls.find((c) => c.method === "order")?.args).toEqual([
      "created_at",
      { ascending: true },
    ]);
  });

  it("returns empty array when no comments", async () => {
    const client = makeClient({
      poll_comments: () => ({ data: [], error: null }),
    });
    const result = await getPollComments(client, POLL_ID);
    expect(result).toEqual([]);
  });

  it("returns empty array when data is null", async () => {
    const client = makeClient({
      poll_comments: () => ({ data: null, error: null }),
    });
    const result = await getPollComments(client, POLL_ID);
    expect(result).toEqual([]);
  });

  it("throws on Supabase error", async () => {
    const client = makeClient({
      poll_comments: () => ({
        data: null,
        error: { message: "rls denied" },
      }),
    });
    await expect(getPollComments(client, POLL_ID)).rejects.toThrow(
      "getPollComments failed: rls denied"
    );
  });
});

// ---------------------------------------------------------------------------
// getCommentsForTrip
// ---------------------------------------------------------------------------

describe("getCommentsForTrip", () => {
  it("returns comments on success, scoped by trip_id", async () => {
    const { calls, client } = makeSequencedBuilder([
      { data: [mockComment], error: null },
    ]);

    const result = await getCommentsForTrip(
      client as unknown as SupabaseClient,
      TRIP_ID
    );
    expect(result).toHaveLength(1);
    expect(calls.find((c) => c.method === "eq")?.args).toEqual([
      "trip_id",
      TRIP_ID,
    ]);
    expect(calls.find((c) => c.method === "order")?.args).toEqual([
      "created_at",
      { ascending: true },
    ]);
  });

  it("returns empty array when data is null", async () => {
    const client = makeClient({
      poll_comments: () => ({ data: null, error: null }),
    });
    const result = await getCommentsForTrip(client, TRIP_ID);
    expect(result).toEqual([]);
  });

  it("throws on Supabase error", async () => {
    const client = makeClient({
      poll_comments: () => ({
        data: null,
        error: { message: "boom" },
      }),
    });
    await expect(getCommentsForTrip(client, TRIP_ID)).rejects.toThrow(
      "getCommentsForTrip failed: boom"
    );
  });
});

// ---------------------------------------------------------------------------
// enrichPollComments — the "Someone" author-fallback resolver
// ---------------------------------------------------------------------------

describe("enrichPollComments", () => {
  const memberMap = new Map<string, string | null>([
    [MEMBER_ID, "Dave"],
    ["member-no-name", null],
  ]);

  it("resolves authorDisplayName from the map by author_trip_member_id", () => {
    const [result] = enrichPollComments([mockComment], memberMap);
    expect(result.authorDisplayName).toBe("Dave");
  });

  it('resolves to "Someone" (announcements_author_fallback) when author_trip_member_id is null', () => {
    const orphan: PollComment = {
      ...mockComment,
      author_trip_member_id: null,
    };
    const [result] = enrichPollComments([orphan], memberMap);
    expect(result.authorDisplayName).toBe(
      M3_UI_STRINGS.announcements_author_fallback
    );
    expect(result.authorDisplayName).toBe("Someone");
  });

  it('resolves to "Someone" when author_trip_member_id is missing from the map (departed member)', () => {
    const gone: PollComment = {
      ...mockComment,
      author_trip_member_id: "member-departed",
    };
    const [result] = enrichPollComments([gone], memberMap);
    expect(result.authorDisplayName).toBe(
      M3_UI_STRINGS.announcements_author_fallback
    );
  });

  it('resolves to "Someone" (not "Guest") when the member has no display_name', () => {
    const anon: PollComment = {
      ...mockComment,
      author_trip_member_id: "member-no-name",
    };
    const [result] = enrichPollComments([anon], memberMap);
    expect(result.authorDisplayName).toBe("Someone");
    expect(result.authorDisplayName).not.toBe("Guest");
  });

  it("does not mutate the input rows", () => {
    const input = { ...mockComment };
    enrichPollComments([input], memberMap);
    expect(input).toEqual(mockComment);
  });
});

// ---------------------------------------------------------------------------
// deleteComment
// ---------------------------------------------------------------------------

describe("deleteComment", () => {
  it("deletes by id with an exact count", async () => {
    const { calls, client } = makeSequencedBuilder([
      { data: null, error: null, count: 1 },
    ]);

    await deleteComment(client as unknown as SupabaseClient, "comment-1");

    expect(calls.find((c) => c.method === "delete")?.args[0]).toEqual({
      count: "exact",
    });
    expect(calls.find((c) => c.method === "eq")?.args).toEqual([
      "id",
      "comment-1",
    ]);
  });

  it("throws POLL_COMMENT_NO_ROW when nothing matched", async () => {
    const { client } = makeSequencedBuilder([
      { data: null, error: null, count: 0 },
    ]);

    const err = await deleteComment(
      client as unknown as SupabaseClient,
      "comment-1"
    ).then(
      () => null,
      (e: unknown) => e
    );

    expect(err).toBeInstanceOf(PollCommentDbError);
    expect((err as PollCommentDbError).code).toBe(POLL_COMMENT_NO_ROW);
  });

  it("preserves error.code on failure", async () => {
    const { client } = makeSequencedBuilder([
      { data: null, error: { code: "42501", message: "rls" }, count: null },
    ]);

    const err = await deleteComment(
      client as unknown as SupabaseClient,
      "comment-1"
    ).then(
      () => null,
      (e: unknown) => e
    );

    expect(err).toBeInstanceOf(PollCommentDbError);
    expect((err as PollCommentDbError).code).toBe("42501");
  });
});
