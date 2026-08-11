/**
 * I4 / #572 — PostgREST embed-resolution invariant.
 *
 * THE INVARIANT: no `lib/db` read embeds a table ambiguously. Adding a 2nd FK
 * from a table to an already-embedded table makes a bare `other!inner(...)`
 * embed ambiguous → PostgREST HTTP 300 → the read crashes in prod (#550: a 2nd
 * FK `trip_member_days → trip_members` took down the crew page). Mocked db
 * tests and the psql RLS harness both miss it — neither exercises PostgREST.
 *
 * TWO LAYERS:
 *
 *  1. Static disambiguation guard (ALWAYS runs, CI-safe). Every embed of an
 *     identity table that accumulates FKs (`trip_members`, `profiles` — writer
 *     / sender / creator / recipient all point at them) MUST carry an explicit
 *     `!<fk>` hint. This fails at author time, in CI, the moment someone writes
 *     a bare `trip_members!inner(...)` — the exact #550 shape.
 *
 *  2. Live REST smoke test (runs only against a reachable local `supabase_rest`
 *     — a no-op in CI, which has no local stack; the mandatory local gate per
 *     the #361 memory). Issues the real REST call for every extracted embed and
 *     asserts the status is not 300. Catches ambiguity on ANY table, not just
 *     the identity ones — the durable form of the by-hand curl the ride-groups
 *     work did.
 *
 * The probe list is AST-extracted (tests/unit/meta/db-embed-probes.ts), so a
 * new embed is covered automatically — no hand-maintained list to drift.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { join } from "node:path";

import { extractEmbedProbes } from "./meta/db-embed-probes";

const DB_DIR = join(process.cwd(), "lib/db");

// Local Supabase defaults — the demo service_role JWT is the SAME fixed,
// non-secret key on every local stack (iss "supabase-demo"); override via env
// for a non-default local setup. NEVER read .env.local here — it points at PROD.
const LOCAL_URL = process.env.SUPABASE_LOCAL_URL ?? "http://127.0.0.1:54321";
const LOCAL_SERVICE_KEY =
  process.env.SUPABASE_LOCAL_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

/** Identity tables that accumulate multiple FKs — bare embeds of these break. */
const DISAMBIGUATION_REQUIRED = new Set(["trip_members", "profiles"]);

const probes = extractEmbedProbes(DB_DIR);

async function restReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${LOCAL_URL}/rest/v1/trips?select=id&limit=0`, {
      headers: { apikey: LOCAL_SERVICE_KEY, Authorization: `Bearer ${LOCAL_SERVICE_KEY}` },
      signal: AbortSignal.timeout(2000),
    });
    return res.status < 500;
  } catch {
    return false;
  }
}

describe("I4 — PostgREST embed disambiguation (static, CI-safe)", () => {
  it("extracts every lib/db embed (extractor sanity)", () => {
    expect(probes.length).toBeGreaterThan(0);
  });

  it("every identity-table embed carries an explicit !fk hint", () => {
    const bare: string[] = [];
    for (const p of probes) {
      for (const e of p.embeds) {
        if (DISAMBIGUATION_REQUIRED.has(e.embeddedTable) && e.hints.length === 0) {
          bare.push(
            `${p.file}:${p.line} — bare \`${e.raw.trim()}\` (add !<fk_column>; a 2nd FK makes this HTTP 300)`,
          );
        }
      }
    }
    expect(bare, "ambiguity-prone embeds missing a !fk disambiguation hint").toEqual([]);
  });
});

describe("I4 — PostgREST embed resolution (live, local-gated)", () => {
  let available = false;
  beforeAll(async () => {
    available = await restReachable();
    if (!available) {
      // Loud skip — this gate only bites when run against the local stack.
      console.warn(
        `[I4] local supabase_rest unreachable at ${LOCAL_URL} — embed smoke test SKIPPED (expected in CI; run \`pnpm dlx supabase start\` locally to exercise it).`,
      );
    }
  });

  it("every extracted embed resolves without an HTTP 300 (ambiguity)", async (ctx) => {
    if (!available) return ctx.skip();
    const failures: string[] = [];
    for (const p of probes) {
      const url = `${LOCAL_URL}/rest/v1/${p.table}?select=${encodeURIComponent(p.select)}&limit=1`;
      const res = await fetch(url, {
        headers: { apikey: LOCAL_SERVICE_KEY, Authorization: `Bearer ${LOCAL_SERVICE_KEY}` },
        signal: AbortSignal.timeout(5000),
      });
      if (res.status === 300) {
        failures.push(`${p.file}:${p.line} — ${p.table} embed → HTTP 300 (ambiguous): ${p.select}`);
      }
    }
    expect(failures, "embeds resolving to HTTP 300").toEqual([]);
  });
});
