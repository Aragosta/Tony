import { roundCents } from "../lib/money/round.ts"

/** Money rule 5: the refund for a payment of `paidCents`, as a negative amount. */
export function refundAmount(paidCents: number, refundRate: number): number {
  if (refundRate < 0 || refundRate > 1) throw new RangeError(`refund rate must be 0..1, got ${refundRate}`)
  return roundCents(-paidCents * refundRate)
}
