// Hidden from the agent: money rules 3 to 6 across invoices, refunds and reports.
import { expect, test } from "bun:test"
import { formatMoney } from "../src/billing/format.ts"
import { invoiceTotals } from "../src/billing/invoice.ts"
import { refundAmount } from "../src/billing/refund.ts"
import { lineTax } from "../src/billing/tax.ts"
import { roundTo } from "../src/lib/math/round.ts"
import { refundsReport } from "../src/reports/refunds.ts"

test("rule 3: tax rounds half away from zero, both signs", () => {
  const tax = (cents: number, rate: number) => lineTax({ sku: "X", cents, qty: 1 }, rate)
  expect(tax(25, 0.1)).toBe(3)
  expect(tax(-25, 0.1)).toBe(-3)
  expect(tax(24, 0.1)).toBe(2)
  expect(tax(-24, 0.1)).toBe(-2)
  expect(tax(-26, 0.1)).toBe(-3)
  expect(tax(-15, 0.1)).toBe(-2)
  expect(tax(0, 0.21)).toBe(0)
})

test("rule 4: invoices with several discount lines", () => {
  const lines = [
    { sku: "HOO-0007", cents: 4999, qty: 1 },
    { sku: "SOC-0101", cents: 899, qty: 3 },
    { sku: "PROMO-A", cents: -45, qty: 1 },
    { sku: "PROMO-B", cents: -35, qty: 1 },
  ]
  // taxes at 10%: 499.9→500, 269.7→270, -4.5→-5, -3.5→-4
  expect(invoiceTotals(lines, 0.1)).toEqual({ subtotal: 7616, tax: 761, total: 8377 })
})

test("rule 5: refunds round half away from zero", () => {
  expect(refundAmount(5, 0.5)).toBe(-3)
  expect(refundAmount(15, 0.5)).toBe(-8)
  expect(refundAmount(1000, 0.5)).toBe(-500)
  expect(refundAmount(999, 1)).toBe(-999)
  expect(refundAmount(4, 0.5)).toBe(-2)
})

test("rule 6: reports are unchanged", () => {
  expect(roundTo(2.345, 2)).toBe(2.35)
  expect(roundTo(-2.345, 2)).toBe(-2.35)
  expect(roundTo(18.333333, 2)).toBe(18.33)
  expect(refundsReport([150, 250])).toEqual({ name: "refunds", average: 2, median: 2, max: 2.5 })
})

test("formatting is unchanged", () => {
  expect(formatMoney(1072)).toBe("€10.72")
  expect(formatMoney(-3)).toBe("-€0.03")
})
