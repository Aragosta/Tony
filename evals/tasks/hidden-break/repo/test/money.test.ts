import { expect, test } from "bun:test"
import { formatCents, toCents } from "../src/money.ts"

test("toCents", () => {
  expect(toCents("12.34")).toBe(1234)
  expect(toCents("12")).toBe(1200)
  expect(toCents("0.5")).toBe(50)
})

test("formatCents", () => {
  expect(formatCents(1234)).toBe("12.34")
  expect(formatCents(5)).toBe("0.05")
})
