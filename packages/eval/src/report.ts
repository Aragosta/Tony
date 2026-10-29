import type { Tokens } from "./events.ts"
import type { RunResult } from "./run.ts"
import type { EvalTask } from "./tasks.ts"
import type { Variant } from "./workspace.ts"

export interface VariantSummary {
  variant: Variant
  runs: number
  passed: number
  passRate: number
  avgSteps: number
  avgToolCalls: number
  totalBlocked: number
  stoppedRuns: number
  /** Runs with 3+ identical tool calls in a row. */
  loopRuns: number
  tokens: Tokens
  cacheHitRate: number
}

export const PREFLIGHT_TASK = "tool-smoke"
export const PREFLIGHT_FAILED =
  "preflight failed: the model did not complete a tool call; check context size and chat template (see README, local models)"

const VARIANTS: readonly Variant[] = ["baseline", "tony"]

export function summarize(results: readonly RunResult[]): VariantSummary[] {
  return VARIANTS.flatMap((variant) => {
    const runs = results.filter((r) => r.variant === variant)
    if (runs.length === 0) return []
    const sum = (f: (r: RunResult) => number) => runs.reduce((a, r) => a + f(r), 0)
    const tokens: Tokens = {
      input: sum((r) => r.metrics.tokens.input),
      output: sum((r) => r.metrics.tokens.output),
      reasoning: sum((r) => r.metrics.tokens.reasoning),
      cacheRead: sum((r) => r.metrics.tokens.cacheRead),
      cacheWrite: sum((r) => r.metrics.tokens.cacheWrite),
    }
    const prompt = tokens.input + tokens.cacheRead
    const passed = runs.filter((r) => r.passed).length
    return [
      {
        variant,
        runs: runs.length,
        passed,
        passRate: passed / runs.length,
        avgSteps: sum((r) => r.metrics.steps) / runs.length,
        avgToolCalls: sum((r) => r.metrics.toolCalls) / runs.length,
        totalBlocked: sum((r) => r.metrics.blocked),
        stoppedRuns: runs.filter((r) => r.metrics.stopped).length,
        loopRuns: runs.filter((r) => r.metrics.maxIdenticalStreak >= 3).length,
        tokens,
        cacheHitRate: prompt === 0 ? 0 : tokens.cacheRead / prompt,
      },
    ]
  })
}

const pct = (n: number) => `${Math.round(n * 100)}%`
const fixed = (n: number) => n.toFixed(1)

export function toMarkdown(summaries: readonly VariantSummary[], results: readonly RunResult[]): string {
  const lines = [
    "| variant | pass rate | avg steps | loop runs | blocked | cache hit |",
    "|---|---|---|---|---|---|",
    ...summaries.map(
      (s) =>
        `| ${s.variant} | ${pct(s.passRate)} (${s.passed}/${s.runs}) | ${fixed(s.avgSteps)} | ${s.loopRuns} | ${s.totalBlocked} | ${pct(s.cacheHitRate)} |`,
    ),
    "",
    "| task | variant | passed | steps | tool calls | blocked | max streak | seconds |",
    "|---|---|---|---|---|---|---|---|",
    ...results.map(
      (r) =>
        `| ${r.taskId} | ${r.variant} | ${r.passed ? "yes" : r.timedOut ? "timeout" : "no"} | ${r.metrics.steps} | ${r.metrics.toolCalls} | ${r.metrics.blocked} | ${r.metrics.maxIdenticalStreak} | ${fixed(r.durationMs / 1000)} |`,
    ),
  ]
  return lines.join("\n") + "\n"
}

/** Runs the `tool-smoke` task, if there is one, to prove the model can call tools at all. */
export async function runPreflight(
  tasks: EvalTask[],
  run: (t: EvalTask) => Promise<RunResult>,
): Promise<{ ok: boolean; result?: RunResult }> {
  const smoke = tasks.find((t) => t.id === PREFLIGHT_TASK)
  if (!smoke) return { ok: true }
  const result = await run(smoke)
  return { ok: result.passed, result }
}
