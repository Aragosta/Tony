import { expect, test } from "bun:test"
import { salesReport } from "../src/reports/sales.ts"

test("sales report", () => {
  expect(salesReport([1000, 2000, 2500])).toEqual({ name: "sales", average: 18.33, median: 20, max: 25 })
})
