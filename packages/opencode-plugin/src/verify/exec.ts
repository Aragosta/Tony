import { spawn } from "node:child_process"
import { killCommand, spawnSpec } from "../platform.ts"

export interface ExecResult {
  code: number | null
  output: string
  timedOut: boolean
}

export type Exec = (command: string, cwd: string, timeoutMs: number) => Promise<ExecResult>

const OUTPUT_CHARS = 20000

/** Runs `command` in the platform's shell; on timeout everything it started is killed. */
export const exec: Exec = (command, cwd, timeoutMs) =>
  new Promise((resolve) => {
    let output = ""
    let timedOut = false
    const keep = (d: Buffer) => {
      output = (output + d.toString("utf8")).slice(-OUTPUT_CHARS)
    }
    const spec = spawnSpec(command)
    // Many tools (opencode among them) read $PWD rather than the process cwd.
    // No stdin, and CI=1 so test runners don't wait for input or start in watch mode.
    const child = spawn(spec.file, spec.args, {
      cwd,
      shell: spec.shell,
      detached: spec.detached,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PWD: cwd, CI: "1" },
    })
    child.stdout!.on("data", keep)
    child.stderr!.on("data", keep)
    const timer = setTimeout(() => {
      timedOut = true
      const kill = killCommand(child.pid!)
      try {
        if (kill) spawn(kill.file, kill.args, { stdio: "ignore", windowsHide: true })
        else process.kill(-child.pid!, "SIGKILL")
      } catch {}
    }, timeoutMs)
    child.on("error", (err) => {
      clearTimeout(timer)
      resolve({ code: null, output: err.message, timedOut: false })
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ code, output, timedOut })
    })
  })
