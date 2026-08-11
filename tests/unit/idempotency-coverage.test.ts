/**
 * I2 — Idempotency on every mutation (drunk-double-tap regression gate).
 *
 * THE INVARIANT (CLAUDE.md rule #9): a mutation into a replay-tracked table
 * must be idempotent. Concretely, in two halves:
 *   (schema) every table that declares an `idempotency_key uuid` COLUMN also
 *     carries a PARTIAL UNIQUE index `where idempotency_key is not null` — else
 *     the column is inert and a retry inserts a duplicate row; and
 *   (action) every `.insert(...)` in lib/actions whose target table has that
 *     column WRITES `idempotency_key` in the payload — else the app never
 *     populates the guard the schema provides.
 *
 * Tables that guarantee replay-safety through a NATURAL unique key instead
 * (e.g. `itinerary_item_member_flags` unique(item_id, trip_member_id, flag);
 * announcement reactions unique(announcement_id, trip_member_id, emoji)) do
 * NOT declare an idempotency_key column, so they are correctly out of both
 * halves — a 23505 on replay self-heals against the natural key.
 *
 * THE CHECKER (this file): a migration text scan (idempotencyColumnTables /
 * idempotencyIndexTables) crossed with the AST insert-payload extractor reused
 * from the I1 gate (extractWrites). Fully static, CI-runnable. Baseline clean;
 * gate stops a new idempotency_key column shipped without its index, or a new
 * insert into a tracked table that forgets the key. Prior: rule #9; #158
 * invite key; expense-split replay.
 */

import { describe, it, expect } from "vitest";
import { join } from "node:path";

import { extractWrites } from "./meta/db-write-read-usage";
import {
  idempotencyColumnTables,
  idempotencyIndexTables,
} from "./meta/migration-idempotency";

const MIGRATIONS_DIR = join(process.cwd(), "supabase/migrations");
const ACTIONS_DIR = join(process.cwd(), "lib/actions");

/**
 * Tables that carry an idempotency_key column but INTENTIONALLY have no partial
 * unique index on it, because replay-safety is guaranteed another way. Each
 * entry must be documented at the migration and be a natural-key/upsert guard,
 * not a forgotten index.
 */
const NO_INDEX_EXEMPT_TABLES: Record<string, string> = {
  // The natural `rsvp_confirm_prompts_one_active` unique index + organizer
  // upsert-replace IS the rule-9 guarantee (a double-tap replaces the row). A
  // partial unique on idempotency_key would fight the upsert's single conflict
  // target; the column is carried for audit/parity only. Documented in
  // 20260810020000_rsvp_confirm_prompts.sql lines 24-30.
  rsvp_confirm_prompts: "natural one-active unique + upsert-replace is the guard",
};

/**
 * Tables whose insert may legitimately omit an idempotency_key even though the
 * column exists. Keep EMPTY — an entry here is a table with a replay guard the
 * app never populates. (No such case today.)
 */
const INSERT_EXEMPT_TABLES = new Set<string>([
  ...Object.keys(NO_INDEX_EXEMPT_TABLES),
]);

const columnTables = idempotencyColumnTables(MIGRATIONS_DIR);
const indexTables = idempotencyIndexTables(MIGRATIONS_DIR);
const inserts = extractWrites(ACTIONS_DIR).filter((w) => w.method === "insert");

describe("I2 — idempotency coverage", () => {
  it("scans a non-trivial set of idempotency columns and indexes (sanity)", () => {
    expect(columnTables.size).toBeGreaterThan(5);
    expect(indexTables.size).toBeGreaterThan(5);
    expect(inserts.length).toBeGreaterThan(0);
  });

  it("every idempotency_key column ships a partial unique index (schema half)", () => {
    const inert = [...columnTables]
      .filter((t) => !indexTables.has(t) && !(t in NO_INDEX_EXEMPT_TABLES))
      .sort();
    // A column without `create unique index … where idempotency_key is not
    // null` gives ZERO replay protection — the retry just inserts again.
    expect(
      inert,
      "tables with an idempotency_key column but no partial unique index",
    ).toEqual([]);
  });

  it("the no-index exemption stays minimal and every entry is a real column", () => {
    for (const t of Object.keys(NO_INDEX_EXEMPT_TABLES)) {
      expect(columnTables.has(t), `${t} must have an idempotency_key column`).toBe(
        true,
      );
      expect(indexTables.has(t), `${t} must NOT have a partial unique index`).toBe(
        false,
      );
    }
    expect(Object.keys(NO_INDEX_EXEMPT_TABLES).length).toBeLessThanOrEqual(2);
  });

  it("no partial unique index without its backing column (scan cross-check)", () => {
    // Guards the scanner itself: an index table the column scan missed means a
    // regex drifted, not a real orphan (Postgres would reject the index).
    const orphanIndex = [...indexTables]
      .filter((t) => !columnTables.has(t))
      .sort();
    expect(orphanIndex, "partial unique index with no scanned column").toEqual(
      [],
    );
  });

  it("every insert into a tracked table writes idempotency_key (action half)", () => {
    const violations = inserts
      .filter(
        (w) =>
          w.table !== null &&
          columnTables.has(w.table) &&
          !INSERT_EXEMPT_TABLES.has(w.table) &&
          !w.keys.includes("idempotency_key"),
      )
      .map((w) => `${w.file}:${w.line} insert into ${w.table} omits idempotency_key`);
    expect(
      violations,
      "inserts into a replay-tracked table without the idempotency_key",
    ).toEqual([]);
  });
});
