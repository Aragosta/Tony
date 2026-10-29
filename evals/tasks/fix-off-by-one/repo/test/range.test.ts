import { expect, test } from "bun:test"
import { range } from "../src/range.ts"

test("includes both ends", () => {
  expect(range(1, 3)).toEqual([1, 2, 3])
})

test("single element", () => {
  expect(range(5, 5)).toEqual([5])
})
