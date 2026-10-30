import { mean, median } from "../lib/math/stats.ts"
import { roundTo } from "../lib/math/round.ts"

/** The tax report: average and median of the month's values, in euros with two decimals. */
export function taxReport(valuesCents: readonly number[]) {
  const euros = valuesCents.map((c) => c / 100)
  return { name: "tax", average: mean(euros), median: median(euros), max: roundTo(Math.max(0, ...euros), 2) }
}
