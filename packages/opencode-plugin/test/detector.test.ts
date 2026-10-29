import { expect, test } from "bun:test"
import { LoopDetector } from "../src/loop/detector.ts"

const make = () => new LoopDetector({ blockAt: 3, stopAt: 5 })

test("ok below threshold", () => {
  const d = make()
  expect(d.record("s", "k")).toEqual({ kind: "ok" })
  expect(d.record("s", "k")).toEqual({ kind: "ok" })
})

test("block at 3, stop at 5", () => {
  const d = make()
  const verdicts = [1, 2, 3, 4, 5].map(() => d.record("s", "k"))
  expect(verdicts).toEqual([
    { kind: "ok" },
    { kind: "ok" },
    { kind: "block", count: 3 },
    { kind: "block", count: 4 },
    { kind: "stop", count: 5 },
  ])
})

test("different key resets", () => {
  const d = make()
  expect(["k", "k", "j", "k"].map((k) => d.record("s", k).kind)).toEqual(["ok", "ok", "ok", "ok"])
})

test("mutation resets", () => {
  const d = make()
  d.record("s", "k")
  d.record("s", "k")
  d.markMutation("s")
  expect(d.record("s", "k")).toEqual({ kind: "ok" })
})

test("streaks are per session", () => {
  const d = make()
  d.record("a", "k")
  d.record("b", "k")
  d.record("a", "k")
  d.record("b", "k")
  expect(d.record("a", "k")).toEqual({ kind: "block", count: 3 })
})

test("reset clears", () => {
  const d = make()
  for (let i = 0; i < 5; i++) d.record("s", "k")
  d.reset("s")
  expect(d.record("s", "k")).toEqual({ kind: "ok" })
})
