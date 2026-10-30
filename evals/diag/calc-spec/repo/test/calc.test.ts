import { expect, test } from "bun:test"
import { CalcError, evaluate } from "../src/calc.ts"

test("precedence", () => {
  expect(evaluate("1 + 2 * 3")).toBe(7)
  expect(evaluate("(1 + 2) * 3")).toBe(9)
})

test("variables", () => {
  expect(evaluate("price * qty", { price: 2.5, qty: 4 })).toBe(10)
})

test("functions", () => {
  expect(evaluate("max(1, 5, 3)")).toBe(5)
})

test("errors carry a position", () => {
  try {
    evaluate("1 + x")
    throw new Error("no error")
  } catch (e) {
    expect(e).toBeInstanceOf(CalcError)
    expect((e as CalcError).message).toBe("unknown variable: x")
    expect((e as CalcError).pos).toBe(4)
  }
})
