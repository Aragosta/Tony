import { describe, expect, test } from "bun:test"
import { cpSync, existsSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { runChecks } from "../src/run.ts"
import { loadTasks } from "../src/tasks.ts"
import { prepareWorkspace } from "../src/workspace.ts"

const root = fileURLToPath(new URL("../../../evals/diag", import.meta.url))
const answer = () => {
  const f = join(mkdtempSync(join(tmpdir(), "tony-final-")), "final.txt")
  writeFileSync(f, "Done.")
  return f
}

// Each diagnostic task must be fair: its check fails on the starting repo and passes with the reference solution.
describe("diagnostic tasks", () => {
  const tasks = loadTasks(root)
  test("there are six, each with hints and a solution", () => {
    expect(tasks.map((t) => t.id)).toEqual(["async-pool", "calc-spec", "deep-rounding", "signature-migration", "stale-cache", "tool-stress"])
    for (const t of tasks) {
      expect(t.diag?.skill).toBeTruthy()
      expect(t.diag?.keyFiles?.length).toBeGreaterThan(0)
      expect(existsSync(join(t.dir, "solution"))).toBe(true)
    }
  })
  for (const task of tasks) {
    test(`${task.id}: fails untouched`, async () => {
      const dir = await prepareWorkspace(task, {})
      expect(runChecks(task, dir, answer()).passed).toBe(false)
    })
    test(`${task.id}: passes with the reference solution`, async () => {
      const dir = await prepareWorkspace(task, {})
      cpSync(join(task.dir, "solution"), dir, { recursive: true })
      const r = runChecks(task, dir, answer())
      if (!r.passed) console.error(task.id, r.failedCheck, r.output)
      expect(r.passed).toBe(true)
    })
  }
})
