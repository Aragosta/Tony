import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

export interface EvalTask {
  id: string
  prompt: string
  check: string
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
      if (typeof raw.check !== "string") throw new Error(`task ${id}: missing check`)
      return {
        id,
        prompt: raw.prompt,
        check: raw.check,
        ...(typeof raw.setup === "string" ? { setup: raw.setup } : {}),
        timeoutSec: typeof raw.timeoutSec === "number" ? raw.timeoutSec : 600,
        dir,
      }
    })
}
