// Usage: bun packages/eval/src/cli.ts --model <provider/model> [--variant baseline|tony|both] [--repeat N]
//          [--tasks id,id] [--langfuse] [--keep] [--opencode <bin>] [--no-preflight]
import { mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { PREFLIGHT_FAILED, runPreflight, summarize, toMarkdown } from "./report.ts"
import { runTask, type RunOptions, type RunResult } from "./run.ts"
import { loadTasks } from "./tasks.ts"
import type { Variant } from "./workspace.ts"

const { values } = parseArgs({
  options: {
    model: { type: "string" },
    variant: { type: "string", default: "both" },
    repeat: { type: "string", default: "1" },
    tasks: { type: "string" },
    langfuse: { type: "boolean", default: false },
    keep: { type: "boolean", default: false },
    opencode: { type: "string", default: "opencode" },
    "no-preflight": { type: "boolean", default: false },
  },
})

if (!values.model) {
  console.error("--model is required")
  process.exit(2)
}
const variants: Variant[] =
  values.variant === "both" ? ["baseline", "tony"] : values.variant === "baseline" || values.variant === "tony" ? [values.variant] : []
const repeat = Number(values.repeat)
if (variants.length === 0 || !Number.isInteger(repeat) || repeat < 1) {
  console.error("--variant must be baseline, tony or both, and --repeat a positive integer")
  process.exit(2)
}

const tonyHome = resolve(process.env.TONY_HOME ?? fileURLToPath(new URL("../../../", import.meta.url)))
const tasksRoot = resolve(process.env.TONY_EVAL_TASKS ?? join(tonyHome, "evals/tasks"))
const allTasks = loadTasks(tasksRoot)
const only = values.tasks?.split(",").map((s) => s.trim())
const tasks = only ? allTasks.filter((t) => only.includes(t.id)) : allTasks
const base: Omit<RunOptions, "variant"> = {
  model: values.model,
  tonyHome,
  langfuse: values.langfuse,
  // A path (not a bare command name) is resolved here, because opencode runs inside each task's workspace.
  opencodeBin: values.opencode.includes("/") ? resolve(values.opencode) : values.opencode,
  keep: values.keep,
}

if (!values["no-preflight"]) {
  const pre = await runPreflight(allTasks, (t) => runTask(t, { ...base, variant: "tony" }))
  if (!pre.ok) {
    console.error(PREFLIGHT_FAILED)
    if (pre.result?.workspace) console.error(`workspace kept at ${pre.result.workspace}`)
    process.exit(3)
  }
}

const results: RunResult[] = []
for (let i = 0; i < repeat; i++) {
  for (const task of tasks) {
    for (const variant of variants) {
      const r = await runTask(task, { ...base, variant })
      results.push(r)
      console.error(`${task.id} [${variant}] ${r.passed ? "pass" : r.timedOut ? "timeout" : "fail"} (${(r.durationMs / 1000).toFixed(1)}s)`)
    }
  }
}

const markdown = toMarkdown(summarize(results), results)
const outDir = join(tonyHome, "evals/results")
const stamp = new Date().toISOString().replace(/[:.]/g, "-")
mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, `${stamp}.json`), JSON.stringify(results, null, 2))
writeFileSync(join(outDir, `${stamp}.md`), markdown)
console.log(markdown)
