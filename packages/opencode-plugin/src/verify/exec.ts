import { spawn } from "node:child_process"

export interface ExecResult {
  code: number | null
  output: string
  timedOut: boolean
}

export type Exec = (command: string, cwd: string, timeoutMs: number) => Promise<ExecResult>

const OUTPUT_CHARS = 20000

/** Runs `command` with bash in its own process group; on timeout the whole group is killed. */
export const exec: Exec = (command, cwd, timeoutMs) =>
  new Promise((resolve) => {
    let output = ""
    let timedOut = false
    const keep = (d: Buffer) => {
      output = (output + d.toString("utf8")).slice(-OUTPUT_CHARS)
    }
    // Many tools (opencode among them) read $PWD rather than the process cwd.
    const child = spawn("bash", ["-lc", command], { cwd, detached: true, env: { ...process.env, PWD: cwd } })
    child.stdout.on("data", keep)
    child.stderr.on("data", keep)
    const timer = setTimeout(() => {
      timedOut = true
      try {
        process.kill(-child.pid!, "SIGKILL")
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
