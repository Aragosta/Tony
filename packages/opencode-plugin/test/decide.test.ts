import { expect, test } from "bun:test"
import { decide, REVIEW_KEY, reportsBlocked, type GateInput } from "../src/core/gate/decide.ts"

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

const passing = [{ command: "bun test", ok: true, output: "" }]

test("review: finished work goes back once, quoting the request", () => {
  const d = decide(input({ checks: passing, review: true, request: "Fix the stale prices." }))
  expect(d.kind).toBe("continue")
  if (d.kind !== "continue") return
  expect(d.keys).toEqual([REVIEW_KEY])
  expect(d.description).toBe("Tony: review against the request")
  expect(d.message).toContain("<request>\nFix the stale prices.\n</request>")
  expect(decide(input({ checks: passing, review: true, rounds: 1, seen: new Set([REVIEW_KEY]) }))).toMatchObject({ kind: "stop", status: "verified" })
})

test("review: not before failing checks are fixed, not when blocked, not without changes, not when off", () => {
  expect(decide(input({ checks: failing, review: true }))).toMatchObject({ kind: "continue", description: "Tony: checks failing" })
  expect(decide(input({ checks: passing, review: true, finalText: "Blocked: no API key" }))).toMatchObject({ status: "needs-user" })
  expect(decide(input({ checks: passing, review: true, changedFiles: 0 }))).toMatchObject({ kind: "stop" })
  expect(decide(input({ checks: passing }))).toMatchObject({ kind: "stop", status: "verified" })
  expect(decide(input({ checks: passing, review: true, rounds: 3 }))).toMatchObject({ kind: "stop", status: "verified" })
})

test("review: a long request is cut", () => {
  const d = decide(input({ review: true, request: "x".repeat(5000) }))
  if (d.kind !== "continue") throw new Error("expected continue")
  expect(d.message.length).toBeLessThan(3500)
})
