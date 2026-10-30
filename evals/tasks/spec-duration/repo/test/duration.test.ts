import { expect, test } from "bun:test"
import { parseDuration } from "../src/duration.ts"

test("parses simple durations", () => {
  expect(parseDuration("2s")).toBe(2000)
  expect(parseDuration("250ms")).toBe(250)
  expect(parseDuration("1h30m")).toBe(5400000)
})
