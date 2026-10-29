import { expect, test } from "bun:test"
import type { RunMetrics } from "../src/events.ts"
import { runPreflight, summarize, toMarkdown } from "../src/report.ts"
import type { RunResult } from "../src/run.ts"
import type { EvalTask } from "../src/tasks.ts"

const metrics = (over: Partial<RunMetrics> = {}): RunMetrics => ({
  steps: 2,
  toolCalls: 3,
  toolErrors: 0,
  blocked: 0,
  stopped: false,
  maxIdenticalStreak: 1,
  tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 },
  errors: [],
  finalText: "",
  ...over,
})

const result = (over: Partial<RunResult>): RunResult => ({
  taskId: "t",
  variant: "baseline",
  model: "m",
  passed: true,
  timedOut: false,
  exitCode: 0,
  durationMs: 1,
  metrics: metrics(),
  checkOutput: "",
  ...over,
})

const results = [
  result({ variant: "tony", taskId: "a" }),
  result({ variant: "baseline", taskId: "a" }),
  result({ variant: "baseline", taskId: "b", passed: false, metrics: metrics({ maxIdenticalStreak: 5 }) }),
  result({ variant: "tony", taskId: "b", metrics: metrics({ blocked: 2 }) }),
]

test("summarize", () => {
  const s = summarize(results)
  expect(s.map((v) => v.variant)).toEqual(["baseline", "tony"])
  expect(s[0]!.passRate).toBe(0.5)
  expect(s[0]!.loopRuns).toBe(1)
  expect(s[1]!.passRate).toBe(1)
  expect(s[1]!.totalBlocked).toBe(2)
})

test("cacheHitRate", () => {
  const tokens = { input: 100, output: 0, reasoning: 0, cacheRead: 300, cacheWrite: 0 }
  expect(summarize([result({ metrics: metrics({ tokens }) })])[0]!.cacheHitRate).toBe(0.75)
  expect(summarize([result({})])[0]!.cacheHitRate).toBe(0)
})

test("preflight aborts", async () => {
  const smoke: EvalTask = { id: "tool-smoke", prompt: "p", check: "c", timeoutSec: 1, dir: "/x" }
  expect((await runPreflight([smoke], async () => result({ passed: false }))).ok).toBe(false)
  expect(await runPreflight([], async () => result({}))).toEqual({ ok: true })
})

test("toMarkdown", () => {
  const md = toMarkdown(summarize(results), results)
  expect(md).toContain("| variant | pass rate | avg steps | loop runs | blocked | cache hit |")
  for (const r of results) expect(md).toContain(`| ${r.taskId} | ${r.variant} |`)
})
