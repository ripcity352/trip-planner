/**
 * Migration text scan for the I2 idempotency invariant
 * (idempotency-coverage.test.ts). Not a test itself (no `.test.` suffix).
 *
 * Two extractors over the raw SQL in supabase/migrations:
 *
 *   idempotencyColumnTables(dir) — every table that declares an
 *     `idempotency_key uuid` COLUMN, whether inline in `create table X (…)`
 *     or via `alter table X add column … idempotency_key uuid`. Function
 *     PARAMETERS (`p_idempotency_key uuid` in a `create function` body) are
 *     excluded — they are not columns.
 *
 *   idempotencyIndexTables(dir) — every table with a PARTIAL UNIQUE index
 *     guarding replays: `create unique index … on X (… idempotency_key …)
 *     where idempotency_key is not null`. The partial `where` clause is
 *     required — a plain unique index would reject two null keys.
 *
 * The invariant (rule #9): a table that stores `idempotency_key` MUST also
 * carry the partial unique index, else the column is inert and a drunk
 * double-tap inserts a duplicate row with a fresh key. A regex over SQL text
 * is sufficient here (this DDL never lives inside a `$$` function body).
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function migrationSql(dir: string): string {
  // Concatenate in filename (timestamp) order — matches apply order, and lets
  // an `alter table … add column` land in the same text as its later index.
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
}

/** Strip `$$ … $$` function bodies (their `p_idempotency_key` params + local
 *  DDL) and SQL comments (a `--` line or `/* … *\/` block may hold a `;` that
 *  would mis-split, or precede a statement and break the `^keyword` anchor). */
function strip(sql: string): string {
  return sql
    .replace(/\$\$[\s\S]*?\$\$/g, "\n") // function bodies
    .replace(/\/\*[\s\S]*?\*\//g, "\n") // block comments
    .replace(/--[^\n]*/g, ""); // line comments
}

/** Statement split on `;` — safe once bodies and comments are stripped. */
function statements(dir: string): string[] {
  return strip(migrationSql(dir))
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

const TABLE_NAME = "(?:public\\.)?([a-z_][a-z0-9_]*)";

export function idempotencyColumnTables(dir: string): Set<string> {
  const tables = new Set<string>();
  for (const stmt of statements(dir)) {
    const lower = stmt.toLowerCase();
    if (!/\bidempotency_key\s+uuid\b/.test(lower)) continue;

    // alter table X ... add column [if not exists] idempotency_key uuid
    const alter = lower.match(
      new RegExp(`^alter\\s+table\\s+(?:only\\s+)?${TABLE_NAME}\\b`),
    );
    if (alter && /\badd\s+column\b/.test(lower)) {
      tables.add(alter[1]);
      continue;
    }

    // create table [if not exists] X ( ... idempotency_key uuid ... )
    const create = lower.match(
      new RegExp(
        `^create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${TABLE_NAME}\\b`,
      ),
    );
    if (create) tables.add(create[1]);
  }
  return tables;
}

export function idempotencyIndexTables(dir: string): Set<string> {
  const tables = new Set<string>();
  for (const stmt of statements(dir)) {
    const lower = stmt.toLowerCase();
    if (!/^create\s+unique\s+index\b/.test(lower)) continue;
    if (!/\bidempotency_key\b/.test(lower)) continue;
    // Must be PARTIAL — the null-tolerating replay guard.
    if (!/\bwhere\s+idempotency_key\s+is\s+not\s+null\b/.test(lower)) continue;
    const on = lower.match(new RegExp(`\\bon\\s+${TABLE_NAME}\\b`));
    if (on) tables.add(on[1]);
  }
  return tables;
}
