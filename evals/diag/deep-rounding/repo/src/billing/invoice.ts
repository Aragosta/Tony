import { sumCents } from "../lib/money/sum.ts"
import { lineAmount } from "./lineItem.ts"
import { lineTax } from "./tax.ts"
import type { Line } from "./types.ts"

export interface InvoiceTotals {
  subtotal: number
  tax: number
  total: number
}

/** Money rule 4. */
export function invoiceTotals(lines: readonly Line[], rate: number): InvoiceTotals {
  const subtotal = sumCents(lines.map(lineAmount))
  const tax = sumCents(lines.map((l) => lineTax(l, rate)))
  return { subtotal, tax, total: subtotal + tax }
}
