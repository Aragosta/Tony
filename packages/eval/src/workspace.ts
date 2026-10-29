import { spawnSync } from "node:child_process"
import { appendFileSync, existsSync, readFileSync } from "node:fs"
import { cp, mkdir, mkdtemp, writeFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
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

/** baseline = plain opencode; tony = config/opencode.json with the published package swapped for this checkout's plugin. */
export function buildConfig(input: ConfigInput): Record<string, unknown> {
  const config: Record<string, any> = {}
  if (input.variant === "tony") {
    Object.assign(config, JSON.parse(readFileSync(join(input.tonyHome, "config/opencode.json"), "utf8")))
    // The eval measures the code in this checkout, not the version on npm.
    config.plugins = [{ ...config.plugins[0], package: join(input.tonyHome, "packages/opencode-plugin") }, ...config.plugins.slice(1)]
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

const SETUP_TIMEOUT_MS = 120_000

function run(dir: string, cmd: string, args: string[]) {
  const r = spawnSync(cmd, args, {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, ...GIT_ENV },
    timeout: SETUP_TIMEOUT_MS,
    killSignal: "SIGKILL",
  })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed in ${dir}: ${r.error?.message ?? (r.stderr || r.stdout)}`)
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


// Keys of the user's global config that change agent behaviour. Dropping them makes both variants start from plain
// opencode, so a globally installed Tony can't leak into the baseline.
const BEHAVIOUR_KEYS = ["plugins", "agents", "experimental"]

/**
 * Creates a temp XDG_CONFIG_HOME holding a copy of the user's global opencode config without BEHAVIOUR_KEYS.
 * Providers, models and other settings still apply. Credentials live in the data dir and are not affected.
 */
export async function isolatedConfigHome(): Promise<string> {
  const source = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "opencode")
  const home = await mkdtemp(join(tmpdir(), "tony-eval-config-"))
  await mkdir(join(home, "opencode"))
  if (existsSync(join(source, "opencode.jsonc"))) {
    throw new Error(`${source}/opencode.jsonc is not supported by the eval; use opencode.json`)
  }
  const file = join(source, "opencode.json")
  if (existsSync(file)) {
    const config = JSON.parse(readFileSync(file, "utf8"))
    for (const key of BEHAVIOUR_KEYS) delete config[key]
    await writeFile(join(home, "opencode", "opencode.json"), JSON.stringify(config, null, 2))
  }
  return home
}
