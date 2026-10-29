import { spawnSync } from "node:child_process"
import { appendFileSync, existsSync, readFileSync } from "node:fs"
import { cp, mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { EvalTask } from "./tasks.ts"

export type Variant = "baseline" | "tony"

export interface ConfigInput {
  variant: Variant
  tonyHome: string
  langfuse: boolean
  tags: string[]
}

export const LANGFUSE_PACKAGE = "@langfuse/opencode-observability-plugin@0.7.0"

/** baseline = plain opencode; tony = config/opencode.json with the plugin path made absolute. */
export function buildConfig(input: ConfigInput): Record<string, unknown> {
  const config: Record<string, any> = {}
  if (input.variant === "tony") {
    const text = readFileSync(join(input.tonyHome, "config/opencode.json"), "utf8")
    Object.assign(config, JSON.parse(text.replaceAll("{env:TONY_HOME}", input.tonyHome)))
  }
  if (input.langfuse) {
    config.plugins = [...(config.plugins ?? []), { package: LANGFUSE_PACKAGE, options: { tags: input.tags } }]
  }
  return config
}

// Lets `setup` scripts commit without a global git identity.
const GIT_ENV = {
  GIT_AUTHOR_NAME: "tony-eval",
  GIT_AUTHOR_EMAIL: "eval@tony",
  GIT_COMMITTER_NAME: "tony-eval",
  GIT_COMMITTER_EMAIL: "eval@tony",
}

function run(dir: string, cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, { cwd: dir, encoding: "utf8", env: { ...process.env, ...GIT_ENV } })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed in ${dir}: ${r.stderr || r.stdout}`)
}

/** Copies the task's fixture repo into a temp dir, writes the config, commits, then runs `setup`. */
export async function prepareWorkspace(task: EvalTask, config: Record<string, unknown>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tony-eval-"))
  const repo = join(task.dir, "repo")
  if (existsSync(repo)) await cp(repo, dir, { recursive: true })
  run(dir, "git", ["init", "-q"])
  // The harness config is not part of the task: keep it out of commits and `git status`.
  appendFileSync(join(dir, ".git/info/exclude"), "\nopencode.json\n")
  await writeFile(join(dir, "opencode.json"), JSON.stringify(config, null, 2))
  run(dir, "git", ["add", "-A"])
  run(dir, "git", ["commit", "-q", "--allow-empty", "-m", "initial"])
  if (task.setup) run(dir, "bash", ["-lc", task.setup])
  return dir
}

