import { spawn, spawnSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { parseEvents } from "../../src/events.ts"
import { opencodeBinary } from "../../src/opencode-bin.ts"
import type { GateRecord } from "../../src/run.ts"
import { startMockLLM, type Step } from "./mock-llm.ts"

const PLUGIN = fileURLToPath(new URL("../../../opencode-plugin", import.meta.url))
const GIT_ENV = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" }

export interface ScriptedRun {
  workspace: string
  log: string[]
  status: GateRecord[]
  exitCode: number | null
  finalText: string
  /** The loop guard paused the session. */
  stopped: boolean
  /** opencode's raw `--format json` output, one event per line. */
  events: string[]
}

const lines = (file: string) => (existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean) : [])

/** Runs real `opencode run` in a fresh git repo against a scripted model. */
export async function runScripted(opts: {
  script: Step[]
  repo: Record<string, string>
  tony: boolean
  options?: object
  setup?: (workspace: string) => void
  /** Extra `opencode run` flags, such as `--thinking`. */
  flags?: string[]
}): Promise<ScriptedRun> {
  const scratch = mkdtempSync(join(tmpdir(), "tony-int-"))
  const workspace = join(scratch, "repo")
  for (const [path, content] of Object.entries(opts.repo)) {
    mkdirSync(dirname(join(workspace, path)), { recursive: true })
    writeFileSync(join(workspace, path), content)
  }
  mkdirSync(workspace, { recursive: true })
  const env = { ...process.env, ...GIT_ENV }
  spawnSync("bash", ["-lc", "git init -q && echo opencode.json >> .git/info/exclude && git add -A && git commit -qm initial"], { cwd: workspace, env })
  opts.setup?.(workspace)

  const logFile = join(scratch, "requests.jsonl")
  const statusFile = join(scratch, "status.jsonl")
  const mock = await startMockLLM(opts.script, logFile)
  const config: Record<string, unknown> = {
    providers: {
      llamacpp: {
        name: "mock",
        package: "@opencode/ai/providers/openai-compatible",
        settings: { baseURL: `${mock.url}/v1`, apiKey: "x" },
        models: { local: { name: "mock", capabilities: { tools: true }, limit: { context: 131072, output: 16384 } } },
      },
    },
  }
  if (opts.tony) {
    config.plugins = [{ package: PLUGIN, options: opts.options ?? {} }]
  }
  writeFileSync(join(workspace, "opencode.json"), JSON.stringify(config))
  const configHome = join(scratch, "config")
  mkdirSync(configHome)

  let stdout = ""
  const exitCode = await new Promise<number | null>((resolve) => {
    const child = spawn(opencodeBinary(), ["run", "--standalone", "--auto", "--format", "json", ...(opts.flags ?? []), "--model", "llamacpp/local", "go"], {
      cwd: workspace,
      env: { ...env, PWD: workspace, XDG_CONFIG_HOME: configHome, TONY_STATUS_FILE: statusFile },
      stdio: ["ignore", "pipe", "ignore"],
      detached: true,
    })
    child.stdout!.on("data", (d) => (stdout += d))
    const timer = setTimeout(() => {
      try {
        process.kill(-child.pid!, "SIGKILL")
      } catch {}
    }, 120000)
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve(code)
    })
    child.on("error", () => resolve(null))
  })
  mock.stop()
  const raw = stdout.split("\n").filter(Boolean)
  const events = parseEvents(raw)
  return { workspace, log: lines(logFile), status: lines(statusFile).map((l) => JSON.parse(l)), exitCode, finalText: events.finalText, stopped: events.stopped, events: raw }
}
