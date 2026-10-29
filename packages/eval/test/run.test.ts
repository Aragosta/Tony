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

test("opencode sees the workspace as $PWD", async () => {
  const pwdFake = fileURLToPath(new URL("./fixtures/fake-opencode-pwd.ts", import.meta.url))
  const r = await runTask(makeTask("test -f done.txt"), { ...opts, opencodeBin: pwdFake })
  expect(r.passed).toBe(true)
})

test("runs see the user's global config without plugins, agents or experimental", async () => {
  const home = mkdtempSync(join(tmpdir(), "tony-xdg-"))
  mkdirSync(join(home, "opencode"))
  writeFileSync(
    join(home, "opencode", "opencode.json"),
    JSON.stringify({
      plugins: [{ package: "/somewhere/tony/packages/opencode-plugin" }],
      agents: { build: { steps: 150 } },
      experimental: { todo: true },
      providers: { llamacpp: { name: "x" } },
      model: "llamacpp/local",
    }),
  )
  const saved = process.env.XDG_CONFIG_HOME
  process.env.XDG_CONFIG_HOME = home
  try {
    const pwdFake = fileURLToPath(new URL("./fixtures/fake-opencode-pwd.ts", import.meta.url))
    const r = await runTask(makeTask("cat global-seen.json"), { ...opts, opencodeBin: pwdFake })
    expect(JSON.parse(r.checkOutput)).toEqual({ providers: { llamacpp: { name: "x" } }, model: "llamacpp/local" })
  } finally {
    if (saved === undefined) delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME = saved
  }
})

test("a hanging check times out and fails the run", async () => {
  const start = Date.now()
  const r = await runTask(makeTask("sleep 10"), opts)
  expect(r.passed).toBe(false)
  expect(r.checkOutput).toContain("check timed out")
  expect(Date.now() - start).toBeLessThan(5000)
})

test("check sees the final text", async () => {
  const r = await runTask(makeTask('grep -q done "$EVAL_FINAL_TEXT"'), opts)
  expect(r.passed).toBe(true)
})

test("gate status is captured", async () => {
  const gateFake = fileURLToPath(new URL("./fixtures/fake-opencode-gate.sh", import.meta.url))
  const r = await runTask(makeTask("true"), { ...opts, opencodeBin: gateFake })
  expect(r.gate?.status).toBe("verified")
})
