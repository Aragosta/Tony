import { expect, test } from "bun:test"
import type { TurnEvidence } from "../src/gate/evidence.ts"
import { announcesAction, decide, type GateInput } from "../src/gate/decide.ts"

const evidence = (over: Partial<TurnEvidence> = {}): TurnEvidence => ({
  changedFiles: ["a.ts"],
  changeSeq: 1,
  openTodos: [],
  testTampering: [],
  ...over,
})
const input = (over: Partial<GateInput> = {}): GateInput => ({
  evidence: evidence(),
  checks: [],
  checksDetected: true,
  finalText: "Done.",
  rounds: 0,
  seen: new Set(),
  maxRounds: 3,
  ...over,
})
const failing = [{ command: "bun test", ok: false, output: "1 fail" }]

test("failing check continues with output", () => {
  const d = decide(input({ checks: failing }))
  expect(d.kind).toBe("continue")
  if (d.kind !== "continue") return
  expect(d.message).toContain("The project's checks fail:")
  expect(d.message).toContain("1 fail")
  expect(d.description).toBe("Tony: checks failing")
})

test("several reasons in one message", () => {
  const d = decide(input({ checks: failing, evidence: evidence({ openTodos: ["x"] }) }))
  expect(d.kind).toBe("continue")
  if (d.kind !== "continue") return
  expect(d.keys).toHaveLength(2)
  expect(d.description).toBe("Tony: checks failing, open todos")
})

test("seen reasons are not repeated", () => {
  expect(decide(input({ checks: failing, seen: new Set(["checks:bun test"]) }))).toEqual({
    kind: "stop",
    status: "unresolved",
    pending: ["checks:bun test"],
  })
})

test("round cap stops", () => {
  expect(decide(input({ checks: failing, rounds: 3 }))).toMatchObject({ kind: "stop", status: "unresolved" })
})

test("verified", () => {
  expect(decide(input({ checks: [{ command: "bun test", ok: true, output: "" }] }))).toEqual({ kind: "stop", status: "verified", pending: [] })
})

test("no changes", () => {
  expect(decide(input({ evidence: evidence({ changedFiles: [], changeSeq: 0 }) }))).toMatchObject({ status: "no-changes" })
})

test("no checks detected", () => {
  expect(decide(input({ checksDetected: false }))).toMatchObject({ kind: "stop", status: "no-checks" })
})

test("skipped checks don't fail", () => {
  expect(decide(input({ checks: [{ command: "bun test", ok: false, output: "", skipped: true }] }))).toMatchObject({ kind: "stop" })
})

test("announcement", () => {
  expect(announcesAction("I fixed it. Let me run the tests.")).toBe(true)
  expect(announcesAction("Next, I'll update the README:")).toBe(true)
  expect(announcesAction("All tests pass.")).toBe(false)
})

test("let me know is not an announcement", () => {
  expect(announcesAction("Done. Let me know if you need anything else.")).toBe(false)
})
