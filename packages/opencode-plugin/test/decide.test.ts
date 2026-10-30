import { expect, test } from "bun:test"
import { decide, reportsBlocked, type GateInput } from "../src/core/gate/decide.ts"

const input = (over: Partial<GateInput> = {}): GateInput => ({
  checks: [],
  finalText: "Done.",
  changedFiles: 1,
  rounds: 0,
  seen: new Set(),
  maxRounds: 3,
  ...over,
})
const failing = [{ command: "bun test", ok: false, output: "1 fail: parse" }]

test("failing check continues with its output", () => {
  const d = decide(input({ checks: failing }))
  expect(d.kind).toBe("continue")
  if (d.kind !== "continue") return
  expect(d.message).toContain("1 fail: parse")
  expect(d.message).toContain('<check command="bun test">')
  expect(d.description).toBe("Tony: checks failing")
})

test("blocked answer with failing checks stops as needs-user", () => {
  expect(decide(input({ checks: failing, finalText: "Blocked: STATUS_URL is not set" }))).toEqual({ kind: "stop", status: "needs-user", pending: [] })
})

test("same failure after the cap is unresolved", () => {
  expect(decide(input({ checks: failing, rounds: 3 }))).toEqual({ kind: "stop", status: "unresolved", pending: ["checks:bun test"] })
})

test("the same failure is sent back only once", () => {
  const first = decide(input({ checks: failing }))
  if (first.kind !== "continue") throw new Error("expected continue")
  expect(decide(input({ checks: failing, rounds: 1, seen: new Set(first.keys) })).kind).toBe("stop")
})

test("announced steps no longer continue", () => {
  expect(decide(input({ checks: [{ command: "bun test", ok: true, output: "" }], finalText: "Let me run the tests." }))).toEqual({
    kind: "stop",
    status: "verified",
    pending: [],
  })
})

test("skipped checks are neither pass nor fail", () => {
  expect(decide(input({ checks: [{ command: "bun test", ok: false, output: "", skipped: true }] })).kind).toBe("stop")
  expect(decide(input({ checks: [{ command: "bun test", ok: false, output: "", skipped: true }] }))).toMatchObject({ status: "no-checks" })
})

test("no changes, no checks", () => {
  expect(decide(input({ changedFiles: 0 }))).toMatchObject({ status: "no-changes" })
  expect(decide(input())).toMatchObject({ status: "no-checks" })
})

test("blocked spellings", () => {
  for (const t of ["Blocked: x", "**Blocked:** x", "## Blocked: x", "  blocked : x"]) expect(reportsBlocked(t)).toBe(true)
  expect(reportsBlocked("Not blocked: x")).toBe(false)
})
