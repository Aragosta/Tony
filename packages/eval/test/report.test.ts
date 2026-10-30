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
  trace: [],
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
  stderrTail: "",
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
  // In the order they first appear.
  expect(s.map((v) => v.variant)).toEqual(["tony", "baseline"])
  const [tony, baseline] = s
  expect(baseline!.passRate).toBe(0.5)
  expect(baseline!.loopRuns).toBe(1)
  expect(tony!.passRate).toBe(1)
  expect(tony!.totalBlocked).toBe(2)
})

const gate = (status: "verified" | "unresolved" | "needs-user", pending: string[] = []) => ({
  sessionID: "s",
  status,
  rounds: 1,
  checks: [],
  pending,
})

test("gate scorecard: misses and false alarms", () => {
  const s = summarize([
    result({ variant: "tony", passed: false, gate: gate("verified") }),
    result({ variant: "tony", passed: true, gate: gate("verified") }),
    result({ variant: "tony", passed: true, gate: gate("unresolved") }),
    result({ variant: "tony", passed: true, gate: gate("needs-user") }),
    result({ variant: "tony", passed: false, gate: gate("needs-user") }),
  ])[0]!
  expect(s.gateMisses).toBe(1)
  expect(s.gateFalseAlarms).toBe(2)
})

test("seconds per step", () => {
  const s = summarize([result({ durationMs: 10000, metrics: metrics({ steps: 4 }) }), result({ durationMs: 2000, metrics: metrics({ steps: 2 }) })])
  expect(s[0]!.secondsPerStep).toBe(2)
})

test("markdown shows the failed check and the gate's open reason", () => {
  const rs = [
    result({ variant: "tony", passed: false, failedCheck: "answer names the blocker", gate: gate("unresolved", ["failure:shell:{\"command\":\"npx tsx test/money.test.ts\"}", "announce"]) }),
  ]
  const md = toMarkdown(summarize(rs), rs)
  expect(md).toContain("| answer names the blocker |")
  expect(md).toContain("| t | tony | no |")
  expect(md).toContain('| failure:shell:{"command":"npx tsx test/… +1 |')
})

test("cacheHitRate", () => {
  const tokens = { input: 100, output: 0, reasoning: 0, cacheRead: 300, cacheWrite: 0 }
  expect(summarize([result({ metrics: metrics({ tokens }) })])[0]!.cacheHitRate).toBe(0.75)
  expect(summarize([result({})])[0]!.cacheHitRate).toBe(0)
})

test("preflight aborts", async () => {
  const smoke: EvalTask = { id: "tool-smoke", prompt: "p", checks: [{ name: "check", run: "c" }], timeoutSec: 1, dir: "/x" }
  expect((await runPreflight([smoke], async () => result({ passed: false }))).ok).toBe(false)
  expect(await runPreflight([], async () => result({}))).toEqual({ ok: true })
})

test("toMarkdown", () => {
  const md = toMarkdown(summarize(results), results)
  expect(md).toContain("| variant | pass rate | false done | avg steps | s/step | loop runs | blocked | gate rounds | gate miss | gate false alarm | errors | cache hit |")
  for (const r of results) expect(md).toContain(`| ${r.taskId} | ${r.variant} | ${r.passed ? "yes" : "no"} |`)
})

test("false done", () => {
  const s = summarize([
    result({ passed: false }),
    result({ passed: true }),
    result({ passed: false, timedOut: true }),
    result({ passed: false, metrics: metrics({ stopped: true }) }),
  ])
  expect(s[0]!.falseDone).toBe(1)
})

test("errors counted", () => {
  expect(summarize([result({ metrics: metrics({ errors: ["boom"] }) }), result({})])[0]!.errorRuns).toBe(1)
})

test("gate outcomes summarized", () => {
  const gate = (status: "verified" | "unresolved", rounds: number) => ({ sessionID: "s", status, rounds, checks: [], pending: [] })
  const s = summarize([result({ variant: "tony", gate: gate("verified", 0) }), result({ variant: "tony", gate: gate("unresolved", 2) })])
  expect(s[0]!.verifiedRuns).toBe(1)
  expect(s[0]!.avgGateRounds).toBe(1)
})

test("error runs are not false done", () => {
  const s = summarize([result({ passed: false, metrics: metrics({ errors: ["provider down"] }) }), result({ passed: false, exitCode: 1 })])
  expect(s[0]!.falseDone).toBe(0)
})
