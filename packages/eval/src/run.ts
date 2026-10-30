import { spawn, spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseEvents, type RunMetrics } from "./events.ts"
import { opencodeBinary } from "./opencode-bin.ts"
import type { EvalTask } from "./tasks.ts"
import { buildConfig, isolatedConfigHome, prepareWorkspace, type Variant } from "./workspace.ts"

/** One completion-gate status line from the Tony plugin (same shape as its StatusRecord). */
export interface GateRecord {
  sessionID: string
  status: "verified" | "no-changes" | "no-checks" | "unresolved" | "needs-user"
  rounds: number
  checks: { command: string; ok: boolean; skipped?: boolean }[]
  pending: string[]
}

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
  /** Name of the first check step that failed. */
  failedCheck?: string
  /** Last 2000 chars of opencode's stderr, for runs that fail for infrastructure reasons. */
  stderrTail: string
  gate?: GateRecord
  workspace?: string
}

const CHECK_OUTPUT_CHARS = 4000
const STDERR_CHARS = 2000

function lastGateRecord(file: string): GateRecord | undefined {
  if (!existsSync(file)) return undefined
  const last = readFileSync(file, "utf8").trim().split("\n").at(-1)
  try {
    return last ? (JSON.parse(last) as GateRecord) : undefined
  } catch {
    return undefined
  }
}

export interface CheckResult {
  passed: boolean
  failedCheck?: string
  /** Output of the failing step, or of the last step when all pass. */
  output: string
}

/**
 * Runs the task's check steps in order in `workspace`, within the task's timeout; stops at the first failure.
 * The steps run code the model wrote, so they are bounded like the run itself.
 */
export function runChecks(task: EvalTask, workspace: string, finalTextFile: string): CheckResult {
  const deadline = Date.now() + task.timeoutSec * 1000
  let output = ""
  for (const step of task.checks) {
    const left = deadline - Date.now()
    if (left <= 0) return { passed: false, failedCheck: step.name, output: "check timed out" }
    const r = spawnSync("bash", ["-lc", step.run], {
      cwd: workspace,
      encoding: "utf8",
      // EVAL_FINAL_TEXT lets a check grade the agent's answer ("did it say it can't be done?"); EVAL_TASK_DIR holds
      // files the agent never sees, such as hidden test cases.
      env: { ...process.env, PWD: workspace, EVAL_FINAL_TEXT: finalTextFile, EVAL_TASK_DIR: task.dir },
      timeout: left,
      killSignal: "SIGKILL",
      maxBuffer: 64 * 1024 * 1024,
    })
    if (r.error) return { passed: false, failedCheck: step.name, output: `check timed out or failed to run: ${r.error.message}` }
    output = ((r.stdout ?? "") + (r.stderr ?? "")).slice(-CHECK_OUTPUT_CHARS)
    if (r.status !== 0) return { passed: false, failedCheck: step.name, output }
  }
  return { passed: true, output }
}

/** Runs opencode in its own process group; on timeout the whole group is killed. */
function runOpencode(bin: string, args: string[], cwd: string, extraEnv: Record<string, string>, timeoutMs: number) {
  return new Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean; spawnError?: string }>((resolve) => {
    // opencode takes its working directory from $PWD, which spawn's `cwd` does not update.
    const env = { ...process.env, PWD: cwd, ...extraEnv }
    const child = spawn(opencodeBinary(bin), args, { cwd, env, detached: true, stdio: ["ignore", "pipe", "pipe"] })
    child.on("error", (err) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, exitCode: null, timedOut: false, spawnError: err.message })
    })
    let stdout = ""
    let stderr = ""
    let timedOut = false
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (d: string) => (stdout += d))
    child.stderr.setEncoding("utf8")
    child.stderr.on("data", (d: string) => (stderr = (stderr + d).slice(-STDERR_CHARS)))
    const timer = setTimeout(() => {
      timedOut = true
      try {
        process.kill(-child.pid!, "SIGKILL")
      } catch {}
    }, timeoutMs)
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ stdout, stderr, exitCode: code, timedOut })
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
  const configHome = await isolatedConfigHome()
  // Run artifacts live outside the workspace, so the agent never sees them.
  const scratch = await mkdtemp(join(tmpdir(), "tony-eval-run-"))
  const statusFile = join(scratch, "status.jsonl")
  const start = Date.now()
  // --standalone: a private server per run, so runs don't share state through the background service.
  const args = ["run", "--standalone", "--auto", "--format", "json", "--model", opts.model, task.prompt]
  const run = await runOpencode(
    opts.opencodeBin,
    args,
    workspace,
    { XDG_CONFIG_HOME: configHome, TONY_STATUS_FILE: statusFile },
    task.timeoutSec * 1000,
  )
  const durationMs = Date.now() - start
  await rm(configHome, { recursive: true, force: true })
  const metrics = parseEvents(run.stdout.split("\n"))
  const finalTextFile = join(scratch, "final.txt")
  await writeFile(finalTextFile, metrics.finalText)

  let passed = false
  let failedCheck: string | undefined
  let checkOutput = run.timedOut ? `timed out after ${task.timeoutSec}s` : ""
  if (run.spawnError) checkOutput = `opencode failed to start: ${run.spawnError}`
  else if (!run.timedOut) {
    const c = runChecks(task, workspace, finalTextFile)
    passed = c.passed
    failedCheck = c.failedCheck
    checkOutput = c.output
  }

  const gate = lastGateRecord(statusFile)
  await rm(scratch, { recursive: true, force: true })
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
    metrics,
    checkOutput,
    ...(failedCheck ? { failedCheck } : {}),
    stderrTail: run.stderr,
    ...(gate ? { gate } : {}),
    ...(keep ? { workspace } : {}),
  }
}
