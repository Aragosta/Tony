import { mean, median } from "../lib/math/stats.ts"
import { roundTo } from "../lib/math/round.ts"

/** The returns report: average and median of the month's values, in euros with two decimals. */
export function returnsReport(valuesCents: readonly number[]) {
  const euros = valuesCents.map((c) => c / 100)
  return { name: "returns", average: mean(euros), median: median(euros), max: roundTo(Math.max(0, ...euros), 2) }
}
