/**
 * AST extraction for the I7 travel-read filter invariant
 * (travel-read-filters.test.ts). Not a test itself (no `.test.` suffix).
 *
 * The "landed / everyone's in / who's confirmed" glances read the travel and
 * ride tables. Two filters are load-bearing on those reads:
 *   - TENANCY (`.eq("trip_id", …)`) — rule #6, multi-tenant from day one; a
 *     read without it can leak or miscount across trips.
 *   - CONFIRMED-ONLY (`.is("written_by_trip_member_id", null)`) — an
 *     unconfirmed co-traveler tag asserts someone's flight before they opted
 *     in; it must not count them as landed / part of "everyone's in" (#574).
 * A third, DIRECTION (`.eq("direction", …)`), is per-read (a return flight
 * must not count toward arrivals — #477) so it's recorded, not asserted.
 *
 * This extractor finds every `.from(<travel table>)` read in lib/db and walks
 * UP its fluent chain collecting the filter methods applied, so the test can
 * assert the required set per read (with documented manifest-display
 * exemptions, which intentionally SHOW unconfirmed tags).
 *
 * Scope: lib/db only — the canonical read surface (rule #2). Action-layer
 * `.from(travel_legs)` calls are writes and by-id pre-write validation, a
 * different contract, out of this gate.
 */

import ts from "typescript";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const TRAVEL_TABLES = new Set([
  "travel_legs",
  "ride_group_members",
  "travel_legs_manifest",
  "ride_group_manifest",
]);

export type TravelRead = {
  file: string;
  line: number;
  table: string;
  hasTripId: boolean;
  hasConfirmedOnly: boolean;
  hasDirection: boolean;
  /** All filter `col`s seen in the chain — for debugging output. */
  filters: string[];
};

function tsFilesIn(dir: string): string[] {
  return readdirSync(dir)
    .filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".d.ts") && !f.endsWith(".test.ts"),
    )
    .map((f) => join(dir, f));
}

/** First string-literal arg of a call, or null. */
function firstStringArg(call: ts.CallExpression): string | null {
  const a = call.arguments[0];
  return a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a))
    ? a.text
    : null;
}

/** Is this `.is(<col>, null)`? (PostgREST `IS NULL` filter.) */
function isNullFilter(call: ts.CallExpression): boolean {
  const second = call.arguments[1];
  return (
    !!second &&
    second.kind === ts.SyntaxKind.NullKeyword
  );
}

export function extractTravelReads(dir: string): TravelRead[] {
  const reads: TravelRead[] = [];
  for (const file of tsFilesIn(dir)) {
    const sf = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );

    const visit = (node: ts.Node): void => {
      // Find `.from("<travel table>")`.
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "from"
      ) {
        const table = firstStringArg(node);
        if (table && TRAVEL_TABLES.has(table)) {
          // Walk UP the fluent chain collecting filter methods.
          const filters: string[] = [];
          let hasConfirmedOnly = false;
          let cur: ts.Node = node;
          while (
            cur.parent &&
            ts.isPropertyAccessExpression(cur.parent) &&
            cur.parent.expression === cur &&
            cur.parent.parent &&
            ts.isCallExpression(cur.parent.parent) &&
            cur.parent.parent.expression === cur.parent
          ) {
            const method = cur.parent.name.text;
            const call = cur.parent.parent;
            const col = firstStringArg(call);
            if ((method === "eq" || method === "is" || method === "in") && col) {
              filters.push(col);
              if (method === "is" && col === "written_by_trip_member_id" && isNullFilter(call)) {
                hasConfirmedOnly = true;
              }
            }
            cur = call;
          }
          reads.push({
            file: file.split("/").slice(-2).join("/"),
            line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            table,
            hasTripId: filters.includes("trip_id"),
            hasConfirmedOnly,
            hasDirection: filters.includes("direction"),
            filters,
          });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return reads;
}
