import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

/** One named step of a task's check; steps run in order and the first failure fails the run. */
export interface CheckStep {
  name: string
  run: string
}

export interface EvalTask {
  id: string
  prompt: string
  checks: CheckStep[]
  setup?: string
  timeoutSec: number
  /** Absolute path of the task folder; the fixture repo is `<dir>/repo`. */
  dir: string
}

/** Loads every `<root>/<id>/task.json`, sorted by id. */
export function loadTasks(root: string, only?: readonly string[]): EvalTask[] {
  return readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, d.name, "task.json")))
    .map((d) => d.name)
    .filter((id) => !only || only.includes(id))
    .sort()
    .map((id) => {
      const dir = resolve(root, id)
      const raw = JSON.parse(readFileSync(join(dir, "task.json"), "utf8"))
      if (typeof raw.prompt !== "string") throw new Error(`task ${id}: missing prompt`)
      return {
        id,
        prompt: raw.prompt,
        checks: parseChecks(id, raw.check),
        ...(typeof raw.setup === "string" ? { setup: raw.setup } : {}),
        timeoutSec: typeof raw.timeoutSec === "number" ? raw.timeoutSec : 600,
        dir,
      }
    })
}

/** `check` is one command, or named steps so a failed run says which part failed. */
function parseChecks(id: string, check: unknown): CheckStep[] {
  if (typeof check === "string") return [{ name: "check", run: check }]
  const valid = (c: unknown): c is CheckStep =>
    typeof c === "object" && c !== null && typeof (c as CheckStep).name === "string" && typeof (c as CheckStep).run === "string"
  if (Array.isArray(check) && check.length > 0 && check.every(valid)) return check.map(({ name, run }) => ({ name, run }))
  throw new Error(`task ${id}: missing check`)
}
