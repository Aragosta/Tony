import { roundCents } from "../lib/money/round.ts"
import { lineAmount } from "./lineItem.ts"
import type { Line } from "./types.ts"

/** Tax for one line, in whole cents (money rule 3). `rate` is a fraction: 0.21 for 21%. */
export function lineTax(line: Line, rate: number): number {
  return roundCents(lineAmount(line) * rate)
}
