// Pool payouts (spec R3). There is no platform fee: the whole pool is paid out.
// - The top 20% of the field is paid (at least one place).
// - Shares follow a smooth curve: share ∝ 1 / place^PAYOUT_EXPONENT.
// - Every paid place wins at least MIN_MULTIPLE x the entry; the shortfall is taken
//   proportionally from the places above that minimum.
// All amounts are integer cents so the payouts always add up to the pool exactly.

export const PAID_FRACTION = 0.2;
export const PAYOUT_EXPONENT = 0.8;
export const MIN_MULTIPLE = 1.5;

export function paidPlaces(fieldSize: number): number {
  return Math.max(1, Math.floor(fieldSize * PAID_FRACTION));
}

export function computePayouts(fieldSize: number, entryCents: number): number[] {
  const pool = fieldSize * entryCents;
  const k = paidPlaces(fieldSize);
  const weights = Array.from({ length: k }, (_, i) => 1 / Math.pow(i + 1, PAYOUT_EXPONENT));
  const total = weights.reduce((a, b) => a + b, 0);
  let shares = weights.map((w) => (w / total) * pool);

  const minimum = MIN_MULTIPLE * entryCents;
  if (k * minimum <= pool) {
    const deficit = shares.reduce((sum, s) => sum + Math.max(0, minimum - s), 0);
    const surplus = shares.reduce((sum, s) => sum + Math.max(0, s - minimum), 0);
    if (deficit > 0 && surplus > 0) {
      shares = shares.map((s) => (s <= minimum ? minimum : s - ((s - minimum) / surplus) * deficit));
    }
  }

  const cents = shares.map((s) => Math.floor(s));
  cents[0] += pool - cents.reduce((a, b) => a + b, 0); // rounding leftovers go to 1st
  return cents;
}
