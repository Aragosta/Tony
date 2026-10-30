// Usage: bun packages/eval/src/cli.ts --model <provider/model> [--variant name,name] [--repeat N]
//          [--tasks id,id] [--timeout <seconds>] [--langfuse] [--keep] [--opencode <bin>] [--no-preflight]
import { mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { PREFLIGHT_FAILED, PREFLIGHT_TASK, runPreflight, summarize, toMarkdown } from "./report.ts"
import { runTask, type RunOptions, type RunResult } from "./run.ts"
import { capTimeout, loadTasks, parseTimeout } from "./tasks.ts"
import { loadVariants, pickVariants } from "./workspace.ts"

const { values } = parseArgs({
  options: {
    model: { type: "string" },
    variant: { type: "string", default: "baseline,tony" },
    repeat: { type: "string", default: "1" },
    tasks: { type: "string" },
    timeout: { type: "string" },
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
const tonyHome = resolve(process.env.TONY_HOME ?? fileURLToPath(new URL("../../../", import.meta.url)))
let variants: ReturnType<typeof pickVariants>
try {
  variants = pickVariants(values.variant, loadVariants(join(tonyHome, "evals/variants.json")))
} catch (e) {
  console.error((e as Error).message)
  process.exit(2)
}
const repeat = Number(values.repeat)
if (variants.length === 0 || !Number.isInteger(repeat) || repeat < 1) {
  console.error("--variant needs at least one name, and --repeat a positive integer")
  process.exit(2)
}

const tasksRoot = resolve(process.env.TONY_EVAL_TASKS ?? join(tonyHome, "evals/tasks"))
let timeout: number | undefined
try {
  timeout = parseTimeout(values.timeout)
} catch (e) {
  console.error((e as Error).message)
  process.exit(2)
}
const allTasks = capTimeout(loadTasks(tasksRoot), timeout)
const only = values.tasks?.split(",").map((s) => s.trim())
// The preflight task already ran once; it joins the suite only when named.
const tasks = only ? allTasks.filter((t) => only.includes(t.id)) : allTasks.filter((t) => t.id !== PREFLIGHT_TASK)
const base: Omit<RunOptions, "variant" | "options"> = {
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

const outDir = join(tonyHome, "evals/results")
const stamp = new Date().toISOString().replace(/[:.]/g, "-")
mkdirSync(outDir, { recursive: true })
const results: RunResult[] = []
// Saved after every run, so a crash or Ctrl-C keeps what finished.
const save = () => writeFileSync(join(outDir, `${stamp}.json`), JSON.stringify(results, null, 2))
for (let i = 0; i < repeat; i++) {
  for (const task of tasks) {
    for (const { name: variant, options } of variants) {
      const r = await runTask(task, { ...base, variant, options })
      results.push(r)
      save()
      console.error(`${task.id} [${variant}] ${r.passed ? "pass" : r.timedOut ? "timeout" : "fail"} (${(r.durationMs / 1000).toFixed(1)}s)`)
    }
  }
}

const markdown = toMarkdown(summarize(results), results)
writeFileSync(join(outDir, `${stamp}.md`), markdown)
console.log(markdown)
