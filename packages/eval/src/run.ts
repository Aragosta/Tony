import { spawn, spawnSync } from "node:child_process"
import { rm } from "node:fs/promises"
import { parseEvents, type RunMetrics } from "./events.ts"
import type { EvalTask } from "./tasks.ts"
import { buildConfig, prepareWorkspace, type Variant } from "./workspace.ts"

export interface RunOptions {
  model: string
  variant: Variant
  tonyHome: string
  langfuse: boolean
  opencodeBin: string
  keep: boolean
}

export interface RunResult {
  taskId: string
  variant: Variant
  model: string
  passed: boolean
  timedOut: boolean
  exitCode: number | null
  durationMs: number
  metrics: RunMetrics
  checkOutput: string
  workspace?: string
}

const CHECK_OUTPUT_CHARS = 4000

/** Runs opencode in its own process group; on timeout the whole group is killed. */
function runOpencode(bin: string, args: string[], cwd: string, timeoutMs: number) {
  return new Promise<{ stdout: string; exitCode: number | null; timedOut: boolean; spawnError?: string }>((resolve) => {
    // opencode takes its working directory from $PWD, which spawn's `cwd` does not update.
    const env = { ...process.env, PWD: cwd }
    const child = spawn(bin, args, { cwd, env, detached: true, stdio: ["ignore", "pipe", "ignore"] })
    child.on("error", (err) => {
      clearTimeout(timer)
      resolve({ stdout, exitCode: null, timedOut: false, spawnError: err.message })
    })
    let stdout = ""
    let timedOut = false
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (d: string) => (stdout += d))
    const timer = setTimeout(() => {
      timedOut = true
      try {
        process.kill(-child.pid!, "SIGKILL")
      } catch {}
    }, timeoutMs)
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ stdout, exitCode: code, timedOut })
    })
  })
}

export async function runTask(task: EvalTask, opts: RunOptions): Promise<RunResult> {
  const config = buildConfig({
    variant: opts.variant,
    tonyHome: opts.tonyHome,
    langfuse: opts.langfuse,
    tags: ["tony-eval", opts.variant, task.id],
  })
  const workspace = await prepareWorkspace(task, config)
  const start = Date.now()
  // --standalone: a private server per run, so runs don't share state through the background service.
  const args = ["run", "--standalone", "--auto", "--format", "json", "--model", opts.model, task.prompt]
  const run = await runOpencode(opts.opencodeBin, args, workspace, task.timeoutSec * 1000)
  const durationMs = Date.now() - start

  let passed = false
  let checkOutput = run.timedOut ? `timed out after ${task.timeoutSec}s` : ""
  if (run.spawnError) checkOutput = `opencode failed to start: ${run.spawnError}`
  else if (!run.timedOut) {
    const check = spawnSync("bash", ["-lc", task.check], { cwd: workspace, encoding: "utf8" })
    passed = check.status === 0
    checkOutput = (check.stdout + check.stderr).slice(-CHECK_OUTPUT_CHARS)
  }

  const keep = opts.keep || !passed
  if (!keep) await rm(workspace, { recursive: true, force: true })
  return {
    taskId: task.id,
    variant: opts.variant,
    model: opts.model,
    passed,
    timedOut: run.timedOut,
    exitCode: run.exitCode,
    durationMs,
    metrics: parseEvents(run.stdout.split("\n")),
    checkOutput,
    ...(keep ? { workspace } : {}),
  }
}
