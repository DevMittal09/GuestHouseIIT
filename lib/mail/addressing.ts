/**
 * To and CC on staff mail about a booking — the owner's decision (Sep 2026):
 *
 * - **To is the person who must act next** — approve, forward, allocate, or
 *   decide a cancellation. Found through `canReview()` for the booking's
 *   current status (`reviewersForStatus`), or the desk for a desk record.
 * - **"Copy to" is CC.** The Copy-to list from `lib/academic/copy-to.ts`: the
 *   approvers of the booking's chain and, for an office, its head.
 *
 * Anyone already in To is taken out of CC, so nobody gets a message addressed
 * to them twice, and addresses are compared case-insensitively and
 * de-duplicated. Pure, so it is tested directly.
 */

const normal = (address: string) => address.trim().toLowerCase();

/** Trimmed, de-duplicated (ignoring case), empty entries dropped; first spelling wins. */
export function uniqueAddresses(addresses: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of addresses) {
    if (!raw || !raw.trim()) continue;
    const key = normal(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw.trim());
  }
  return out;
}

export function addressStaffMail(
  to: (string | null | undefined)[],
  copyTo: (string | null | undefined)[]
): { to: string[]; cc: string[] } {
  const toList = uniqueAddresses(to);
  const inTo = new Set(toList.map(normal));
  const cc = uniqueAddresses(copyTo).filter((address) => !inTo.has(normal(address)));
  return { to: toList, cc };
}
