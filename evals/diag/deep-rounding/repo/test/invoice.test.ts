import { expect, test } from "bun:test"
import { invoiceTotals } from "../src/billing/invoice.ts"

test("an invoice without discounts", () => {
  expect(invoiceTotals([{ sku: "MUG-0001", cents: 1000, qty: 2 }], 0.21)).toEqual({ subtotal: 2000, tax: 420, total: 2420 })
})

// From finance's report: invoice 2024-0193 was one cent too high.
test("an invoice with a discount line", () => {
  const lines = [
    { sku: "MUG-0001", cents: 1000, qty: 1 },
    { sku: "PROMO-5", cents: -25, qty: 1 },
  ]
  expect(invoiceTotals(lines, 0.1)).toEqual({ subtotal: 975, tax: 97, total: 1072 })
})
