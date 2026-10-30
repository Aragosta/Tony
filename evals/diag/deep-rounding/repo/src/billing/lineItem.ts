import type { Line } from "./types.ts"

/** Unit cents × quantity (money rule 2). */
export function lineAmount(line: Line): number {
  if (!Number.isInteger(line.cents) || !Number.isInteger(line.qty) || line.qty < 1) {
    throw new RangeError(`bad line ${line.sku}: ${line.cents} × ${line.qty}`)
  }
  return line.cents * line.qty
}
