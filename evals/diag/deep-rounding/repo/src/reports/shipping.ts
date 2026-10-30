import { mean, median } from "../lib/math/stats.ts"
import { roundTo } from "../lib/math/round.ts"

/** The shipping report: average and median of the month's values, in euros with two decimals. */
export function shippingReport(valuesCents: readonly number[]) {
  const euros = valuesCents.map((c) => c / 100)
  return { name: "shipping", average: mean(euros), median: median(euros), max: roundTo(Math.max(0, ...euros), 2) }
}
