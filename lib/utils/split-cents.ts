/**
 * evenSplitCents — deterministic even split of an integer cent amount
 * across trip members (#372).
 *
 * Invariants (pinned by lib/utils/__tests__/split-cents.test.ts):
 *   - the split sums to EXACTLY the input amount (no lost/minted cents)
 *   - no two shares differ by more than one cent
 *   - output is deterministic regardless of caller's member order —
 *     ids are sorted and the remainder cents go to the first `r`
 *     members in sorted order, so a replay produces identical rows
 */

export interface SplitShare {
  trip_member_id: string;
  amount_cents: number;
}

export function evenSplitCents(
  totalCents: number,
  memberIds: ReadonlyArray<string>
): SplitShare[] {
  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new Error(`evenSplitCents: totalCents must be a positive integer, got ${totalCents}`);
  }
  const ids = [...new Set(memberIds)].sort();
  if (ids.length === 0) {
    throw new Error("evenSplitCents: at least one member required");
  }

  const base = Math.floor(totalCents / ids.length);
  const remainder = totalCents - base * ids.length;

  return ids.map((id, i) => ({
    trip_member_id: id,
    amount_cents: base + (i < remainder ? 1 : 0),
  }));
}
