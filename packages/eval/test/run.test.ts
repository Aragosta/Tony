import { afterEach, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { runTask, type RunOptions } from "../src/run.ts"
import type { EvalTask } from "../src/tasks.ts"

const fake = fileURLToPath(new URL("./fixtures/fake-opencode.sh", import.meta.url))
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url))

function makeTask(check: string): EvalTask {
  const dir = mkdtempSync(join(tmpdir(), "tony-task-"))
  mkdirSync(join(dir, "repo"))
  writeFileSync(join(dir, "repo", "README.md"), "x")
  return { id: "t", prompt: "do it", check, timeoutSec: 2, dir }
}

const opts: RunOptions = { model: "m/x", variant: "baseline", tonyHome: repoRoot, langfuse: false, opencodeBin: fake, keep: false }

afterEach(() => {
  delete process.env.FAKE_SLEEP
})

test("passes when check succeeds", async () => {
  const r = await runTask(makeTask("test -f done.txt"), opts)
  expect(r.passed).toBe(true)
  expect(r.metrics.toolCalls).toBe(4)
  expect(r.timedOut).toBe(false)
})

test("fails when check fails", async () => {
  const r = await runTask(makeTask("false"), opts)
  expect(r.passed).toBe(false)
  expect(r.workspace).toBeDefined()
})

test("timeout marks the run failed", async () => {
  process.env.FAKE_SLEEP = "5"
  const start = Date.now()
  const r = await runTask(makeTask("test -f done.txt"), opts)
  expect(r.timedOut).toBe(true)
  expect(r.passed).toBe(false)
  expect(Date.now() - start).toBeLessThan(4000)
})

test("missing binary fails the run instead of hanging", async () => {
  const r = await runTask(makeTask("true"), { ...opts, opencodeBin: "/nonexistent/opencode" })
  expect(r.passed).toBe(false)
  expect(r.checkOutput).toContain("failed to start")
})
