// Diagnostic runs: each task runs through `opencode run --thinking`, and every run gets a page with its whole path from
// prompt to answer (thinking, text, each tool call and its result), its findings, and a suite summary of failure modes.
// Usage: bun packages/eval/src/diag.ts --model <provider/model> [--variant name,name] [--repeat N] [--tasks id,id]
//          [--suite <dir>] [--opencode <bin>] [--keep]
//        bun packages/eval/src/diag.ts --replay <results dir>   (rebuild every page from the saved events)
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { runPage, summaryPage, OUTCOME_LABEL, type RunMeta, type SummaryRow } from "./diag-report.ts"
import { diagnose } from "./diagnose.ts"
import { runTask } from "./run.ts"
import { loadTasks, type EvalTask } from "./tasks.ts"
import { loadVariants, pickVariants } from "./workspace.ts"
import { buildTimeline } from "./timeline.ts"

const { values } = parseArgs({
  options: {
    model: { type: "string" },
    variant: { type: "string", default: "baseline" },
    repeat: { type: "string", default: "1" },
    tasks: { type: "string" },
    suite: { type: "string" },
    opencode: { type: "string", default: "opencode" },
    keep: { type: "boolean", default: false },
    replay: { type: "string" },
  },
})

const tonyHome = resolve(process.env.TONY_HOME ?? fileURLToPath(new URL("../../../", import.meta.url)))

/** Every file in the task's starting repo, relative to it. */
function repoFiles(task: EvalTask): string[] {
  const root = join(task.dir, "repo")
  const out: string[] = []
  const walk = (dir: string) => {
    let names: string[]
    try {
      names = readdirSync(dir)
    } catch {
      return
    }
    for (const name of names) {
      const p = join(dir, name)
      if (statSync(p).isDirectory()) walk(p)
      else out.push(relative(root, p).replace(/\\/g, "/"))
    }
  }
  walk(root)
  return out.sort()
}

const base = (m: Pick<RunMeta, "taskId" | "variant" | "run">) => `${m.taskId}.${m.variant}.${m.run}`

function render(dir: string, meta: RunMeta, events: string[], diff: string): SummaryRow {
  const t = buildTimeline(events)
  const d = diagnose(t, meta)
  writeFileSync(join(dir, `${base(meta)}.md`), runPage(meta, t, d, diff))
  return { meta, d, page: `${base(meta)}.md` }
}

function writeSummary(dir: string, rows: SummaryRow[]) {
  const models = [...new Set(rows.map((r) => r.meta.model))].join(", ")
  writeFileSync(join(dir, "README.md"), summaryPage(rows, `Diagnostic runs: ${models}`))
}

if (values.replay) {
  const dir = resolve(values.replay)
  const rows: SummaryRow[] = []
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".meta.json")).sort()) {
    const meta = JSON.parse(readFileSync(join(dir, name), "utf8")) as RunMeta
    const stem = name.slice(0, -".meta.json".length)
    const events = readFileSync(join(dir, `${stem}.events.jsonl`), "utf8").split("\n").filter(Boolean)
    let diff = ""
    try {
      diff = readFileSync(join(dir, `${stem}.diff`), "utf8")
    } catch {}
    rows.push(render(dir, meta, events, diff))
  }
  writeSummary(dir, rows)
  console.log(`rebuilt ${rows.length} run page(s) and ${join(dir, "README.md")}`)
  process.exit(0)
}

if (!values.model) {
  console.error("--model is required (or --replay <dir>)")
  process.exit(2)
}
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

const suite = resolve(values.suite ?? join(tonyHome, "evals/diag"))
const only = values.tasks?.split(",").map((s) => s.trim())
const tasks = loadTasks(suite, only)
if (tasks.length === 0) {
  console.error(`no tasks in ${suite}${only ? ` matching ${only.join(", ")}` : ""}`)
  process.exit(2)
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-")
const dir = join(tonyHome, "evals/diag-results", stamp)
mkdirSync(dir, { recursive: true })
const rows: SummaryRow[] = []
// Variants side by side per task, so an interrupted run still compares them.
const jobs = tasks.flatMap((task) => variants.map((v) => ({ task, ...v })))
for (let n = 1; n <= repeat; n++) {
  for (const { task, name: variant, options } of jobs) {
    const r = await runTask(task, {
      model: values.model,
      variant,
      options,
      tonyHome,
      langfuse: false,
      opencodeBin: values.opencode.includes("/") ? resolve(values.opencode) : values.opencode,
      keep: values.keep,
      capture: true,
    })
    const meta: RunMeta = {
      taskId: task.id,
      prompt: task.prompt,
      variant,
      model: values.model,
      run: n,
      durationMs: r.durationMs,
      exitCode: r.exitCode,
      stderrTail: r.stderrTail,
      passed: r.passed,
      timedOut: r.timedOut,
      ...(r.failedCheck ? { failedCheck: r.failedCheck } : {}),
      checkOutput: r.checkOutput,
      changedFiles: r.changedFiles ?? [],
      repoFiles: repoFiles(task),
      hints: task.diag ?? {},
      ...(r.gate ? { gateRounds: r.gate.rounds } : {}),
    }
    // Saved before rendering, so a bug in the analysis never loses a run: fix it and `--replay`.
    writeFileSync(join(dir, `${base(meta)}.events.jsonl`), (r.events ?? []).join("\n") + "\n")
    writeFileSync(join(dir, `${base(meta)}.meta.json`), JSON.stringify(meta, null, 2))
    writeFileSync(join(dir, `${base(meta)}.diff`), r.diff ?? "")
    const row = render(dir, meta, r.events ?? [], r.diff ?? "")
    rows.push(row)
    writeSummary(dir, rows)
    const turn = row.d.wrongTurn ? ` · ${row.d.wrongTurn.kind}` : ""
    console.error(`${task.id} [${variant}] run ${n}: ${OUTCOME_LABEL[row.d.outcome]} (${(r.durationMs / 1000).toFixed(0)}s, ${row.d.stats.steps} steps${turn})`)
    if (r.workspace) console.error(`  workspace kept at ${r.workspace}`)
  }
}
console.log(readFileSync(join(dir, "README.md"), "utf8"))
console.error(`pages: ${dir}`)
