// Hidden from the agent: cases for every README rule.
import { expect, test } from "bun:test"
import { CalcError, evaluate } from "../src/calc.ts"

function fails(expr: string, message: string, pos: number, vars: Record<string, number> = {}) {
  let err: unknown
  try {
    evaluate(expr, vars)
  } catch (e) {
    err = e
  }
  expect(err).toBeInstanceOf(CalcError)
  expect({ message: (err as CalcError).message, pos: (err as CalcError).pos }).toEqual({ message, pos })
}

test("rule 1: numbers", () => {
  expect(evaluate("12")).toBe(12)
  expect(evaluate("3.5")).toBe(3.5)
  expect(evaluate(".5")).toBe(0.5)
  expect(evaluate("1e3")).toBe(1000)
  expect(evaluate("2.5e-2")).toBe(0.025)
})

test("rule 2: precedence, left associativity, remainder", () => {
  expect(evaluate("10 - 4 - 3")).toBe(3)
  expect(evaluate("100 / 10 / 5")).toBe(2)
  expect(evaluate("2 + 3 * 4 - 6 / 2")).toBe(11)
  expect(evaluate("-7 % 3")).toBe(-1)
  expect(evaluate("7 % 3 * 2")).toBe(2)
})

test("rule 3: power", () => {
  expect(evaluate("2^3^2")).toBe(512)
  expect(evaluate("-2^2")).toBe(-4)
  expect(evaluate("2^-1")).toBe(0.5)
  expect(evaluate("(-2)^2")).toBe(4)
  expect(evaluate("2*3^2")).toBe(18)
})

test("rule 4: unary", () => {
  expect(evaluate("--3")).toBe(3)
  expect(evaluate("2*-3")).toBe(-6)
  expect(evaluate("+4 - -1")).toBe(5)
})

test("rule 5: parentheses", () => {
  expect(evaluate("((2))")).toBe(2)
  expect(evaluate("2 * (3 + (4 - 1)) / 3")).toBe(4)
})

test("rule 6: variables", () => {
  expect(evaluate("_a1 + B", { _a1: 1, B: 2 })).toBe(3)
  fails("2 * total", "unknown variable: total", 4)
})

test("rule 7: functions", () => {
  expect(evaluate("min(4, 2, 8)")).toBe(2)
  expect(evaluate("max(7)")).toBe(7)
  expect(evaluate("abs(-3) + sqrt(16)")).toBe(7)
  expect(evaluate("round(2.5)")).toBe(3)
  expect(evaluate("round(-2.5)")).toBe(-3)
  expect(evaluate("round(-2.4)")).toBe(-2)
  expect(evaluate("max(1, min(5, x))", { x: 3 })).toBe(3)
  fails("1 + foo(2)", "unknown function: foo", 4)
  fails("abs(1, 2)", "wrong number of arguments for abs", 0)
  fails("2 * max()", "wrong number of arguments for max", 4)
})

test("rule 8: division by zero", () => {
  fails("1 / 0", "division by zero", 2)
  fails("5 % (2 - 2)", "division by zero", 2)
})

test("rule 9: whitespace", () => {
  expect(evaluate("  1+\t2 *\n3 ")).toBe(7)
  expect(evaluate("max ( 1 , 2 )")).toBe(2)
})

test("rule 10: error messages and positions", () => {
  fails("", "empty expression", 0)
  fails("   ", "empty expression", 0)
  fails("1 # 2", "unexpected token: #", 2)
  fails("1 2", "unexpected token: 2", 2)
  fails("1 + * 2", "unexpected token: *", 4)
  fails("1 +", "unexpected end of expression", 3)
  fails("(1 + 2", "missing )", 6)
  fails("max(1, 2", "missing )", 8)
  fails("1 + 2)", "unexpected token: )", 5)
})

test("rule 11: not a number", () => {
  fails("sqrt(-1)", "not a number", 0)
})
