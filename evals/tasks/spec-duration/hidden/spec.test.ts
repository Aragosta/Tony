// Hidden from the agent: one or two cases per README rule. The eval check copies this into the workspace's test/.
import { expect, test } from "bun:test"
import { parseDuration } from "../src/duration.ts"

test("rule 1: every unit", () => {
  expect(parseDuration("1d2h3m4s5ms")).toBe(93784005)
  expect(parseDuration("0s")).toBe(0)
})

test("rule 2: spaces between parts and around the input", () => {
  expect(parseDuration("1h 30m")).toBe(5400000)
  expect(parseDuration("  10s  ")).toBe(10000)
})

test("rule 3: decimals", () => {
  expect(parseDuration("1.5h")).toBe(5400000)
  expect(parseDuration("2.25m")).toBe(135000)
})

test("rule 4: units are case-insensitive", () => {
  expect(parseDuration("1H")).toBe(3600000)
  expect(parseDuration("5MS")).toBe(5)
})

test("rule 5: a bare number is milliseconds", () => {
  expect(parseDuration("250")).toBe(250)
})

test("rule 7: no rounding", () => {
  expect(parseDuration("0.5ms")).toBe(0.5)
})

test("rule 8: invalid input throws with the input in quotes", () => {
  for (const bad of ["", "   ", "1y", "-1s", "+1s", "30m1h", "1m1m", "1h 30", ".5h", "5.h", "1 h", "1h30mfoo"]) {
    expect(() => parseDuration(bad)).toThrow(`"${bad}"`)
  }
})
