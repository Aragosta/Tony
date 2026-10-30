import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { runPage, summaryPage, type RunMeta } from "../src/diag-report.ts"
import { diagnose, type DiagContext } from "../src/diagnose.ts"
import { buildTimeline, finalText, type Step, type Timeline, type ToolCall } from "../src/timeline.ts"

// Recorded from real opencode 2.2.1 (`run --format json --thinking`) against the scripted model: parallel reads, a
// failed edit, the fix, `bun test`, an answer. Each step has llama.cpp-style reasoning_content.
const RECORDED = readFileSync(fileURLToPath(new URL("./fixtures/diag-run.jsonl", import.meta.url)), "utf8").split("\n")

const ctx = (over: Partial<DiagContext> = {}): DiagContext => ({
  passed: true,
  timedOut: false,
  checkOutput: "",
  changedFiles: ["src/a.ts"],
  repoFiles: ["package.json", "src/a.ts", "test/a.test.ts"],
  hints: { keyFiles: ["src/a.ts"], protect: ["test/"] },
  ...over,
})

test("timeline from recorded opencode events", () => {
  const t = buildTimeline(RECORDED)
  expect(t.steps.map((s) => s.calls.map((c) => c.tool))).toEqual([["read", "read"], ["edit"], ["edit"], ["shell"], []])
  expect(t.steps[0]!.reasoning).toBe("The add test fails. Read the source and the test together.")
  expect(t.steps[1]!.calls[0]).toMatchObject({ status: "error", output: "No changes to apply: oldString and newString are identical." })
  expect(t.steps[3]!.calls[0]).toMatchObject({ status: "completed", exit: 0 })
  expect(t.steps[0]!.finish).toBe("tool-calls")
  expect(finalText(t)).toBe("Fixed add in src/a.ts:1. Checks: 1 pass.")
})

test("a clean pass: path, stats, no bad findings", () => {
  const d = diagnose(buildTimeline(RECORDED), ctx())
  expect(d.outcome).toBe("pass")
  expect(d.path).toBe(
    'explore (1: read src/a.ts, test/a.test.ts) → edit (2–3: src/a.ts, 1 failed edit(s)) → verify (4: `bun test` ✓) → answer (5: "Fixed add in src/a.ts:1. Checks: 1 pass.")',
  )
  expect(d.findings.filter((f) => f.severity === "bad")).toEqual([])
  expect(d.stats).toMatchObject({ steps: 5, calls: 5, failedCalls: 1, parallelSteps: 1, stepsWithReasoning: 3, filesRead: 2, filesEdited: 1, checkRuns: 1 })
})

test("the same run, graded as failed: a false claim", () => {
  const d = diagnose(buildTimeline(RECORDED), ctx({ passed: false, failedCheck: "hidden cases", checkOutput: "(fail) negative numbers [1.20ms]\nexpected 1 received -1" }))
  expect(d.outcome).toBe("fail")
  expect(d.findings.map((f) => f.kind)).toEqual(expect.arrayContaining(["false-claim", "incomplete-fix"]))
  expect(d.findings.find((f) => f.kind === "check-failed")!.detail).toBe('grader check "hidden cases" failed: 1 failing: negative numbers')
  expect(d.wrongTurn?.kind).toBe("incomplete-fix")
})

// Hand-built timelines for the findings the recording doesn't show.
const call = (tool: string, input: Record<string, unknown>, over: Partial<ToolCall> = {}): ToolCall => ({ tool, input, status: "completed", output: "", ms: 1, ...over })
const step = (index: number, calls: ToolCall[], text = "", reasoning = ""): Step => ({ index, reasoning, text, calls, tokens: { input: 0, output: 0, reasoning: 0, cacheRead: 0 } })
const timeline = (...steps: Step[]): Timeline => ({ steps, errors: [] })
const kinds = (t: Timeline, c: Partial<DiagContext> = {}) => diagnose(t, ctx(c)).findings.map((f) => f.kind)

test("blind edit, no verify, protected file changed", () => {
  const t = timeline(step(1, [call("edit", { path: "src/a.ts", oldString: "-", newString: "+" })]), step(2, [call("write", { path: "test/a.test.ts", content: "" })]), step(3, [], "Done."))
  const k = kinds(t, { passed: false, changedFiles: ["src/a.ts", "test/a.test.ts"] })
  expect(k).toEqual(expect.arrayContaining(["blind-edit", "no-verify", "protected-changed", "false-claim"]))
})

test("retried unchanged, repeated reads, serial reads", () => {
  const bad = call("edit", { path: "src/a.ts", oldString: "x", newString: "y" }, { status: "error", output: "oldString not found in content" })
  const read = (p: string) => call("read", { path: p })
  const t = timeline(step(1, [read("src/a.ts")]), step(2, [read("test/a.test.ts")]), step(3, [read("src/a.ts")]), step(4, [bad]), step(5, [bad]), step(6, [], "I could not apply the edit."))
  const k = kinds(t, { passed: false })
  expect(k).toEqual(expect.arrayContaining(["repeat-call", "serial-reads", "edit-no-match", "retry-unchanged", "honest-failure"]))
  expect(k).not.toContain("false-claim")
})

test("ended on a failing check, check flailing, oscillation", () => {
  const test_ = (exit: number) => call("shell", { command: "bun test" }, { exit })
  const t = timeline(
    step(1, [call("read", { path: "src/a.ts" })]),
    step(2, [call("edit", { path: "src/a.ts", oldString: "a", newString: "b" })]),
    step(3, [test_(1)]),
    step(4, [call("edit", { path: "src/a.ts", oldString: "b", newString: "a" })]),
    step(5, [test_(1)]),
    step(6, [test_(1)]),
    step(7, [], "Fixed it; tests pass."),
  )
  const k = kinds(t, { passed: false })
  expect(k).toEqual(expect.arrayContaining(["ended-on-failing-check", "check-flailing", "oscillation", "false-claim"]))
})

test("key file missed, tool call written as text, no thinking, announced ending", () => {
  const t = timeline(step(1, [call("read", { path: "test/a.test.ts" })]), step(2, [], '<tool_call>\n<function=edit>\n<parameter=path>src/a.ts</parameter>'), step(3, [], "Let me run the tests."))
  const k = kinds(t, { passed: false, changedFiles: [] })
  expect(k).toEqual(expect.arrayContaining(["key-file-missed", "toolcall-as-text", "no-thinking", "ended-announcing"]))
  // A broken tool-call setup explains everything after it.
  expect(diagnose(t, ctx({ passed: false, changedFiles: [] })).wrongTurn?.kind).toBe("toolcall-as-text")
})

test("'0 fail' in the answer is not an admission", () => {
  const t = timeline(step(1, [call("read", { path: "src/a.ts" })]), step(2, [], "Fixed. 12 pass, 0 fail."))
  expect(kinds(t, { passed: false })).toContain("false-claim")
})

test("cat of a repo file counts as reading it", () => {
  const t = timeline(step(1, [call("shell", { command: "cat src/a.ts | head -20" })]), step(2, [call("edit", { path: "src/a.ts", oldString: "a", newString: "b" })]))
  expect(kinds(t)).not.toContain("blind-edit")
})

test("pages render", () => {
  const t = buildTimeline(RECORDED)
  const meta: RunMeta = { ...ctx(), taskId: "t", prompt: "fix add", variant: "baseline", model: "llamacpp/local", run: 1, durationMs: 4200, exitCode: 0, stderrTail: "" }
  const d = diagnose(t, meta)
  const page = runPage(meta, t, d, "diff --git a/src/a.ts b/src/a.ts")
  expect(page).toContain("# t · baseline · run 1: PASS")
  expect(page).toContain("💭 Thinking (58 chars): The add test fails.")
  expect(page).toContain("✗ `edit src/a.ts`")
  expect(page).toContain("> 💬 Fixed add in src/a.ts:1.")
  const summary = summaryPage([{ meta, d, page: "t.baseline.1.md" }], "Diagnostic runs")
  expect(summary).toContain("| t | 1/1 |")
  expect(summary).toContain("[1](t.baseline.1.md)")
  expect(summary).toContain("`edit-no-match`")
})
