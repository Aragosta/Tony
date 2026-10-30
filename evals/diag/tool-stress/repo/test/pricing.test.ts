import { expect, test } from "bun:test"
import { memberPrice, staffPrice } from "../src/pricing/rules.ts"

test("members get 15% off", () => {
  expect(memberPrice(1000)).toBe(850)
})

test("staff keep 10% off", () => {
  expect(staffPrice(1000)).toBe(900)
})
