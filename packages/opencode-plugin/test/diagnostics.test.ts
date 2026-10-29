import { expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { newProblems, normalize } from "../src/diagnostics/diff.ts"
import { registerDiagnostics } from "../src/diagnostics/register.ts"
import type { Exec, ExecResult } from "../src/verify/exec.ts"
import { createFakeHost } from "./fake-host.ts"

test("normalizes positions", () => {
  expect(normalize("src/a.ts(3,5): error TS2322: x")).toBe(normalize("src/a.ts(9,1): error TS2322: x"))
  expect(normalize("a.py:3:1: F401 x")).toBe(normalize("a.py:7:1: F401 x"))
})

test("only new problems", () => {
  expect(newProblems(["a.ts(1,1): error TS1: old"], ["a.ts(2,1): error TS1: old", "a.ts(5,1): error TS2: new"])).toEqual([
    "a.ts(5,1): error TS2: new",
  ])
})

function fakeExec(outputs: Partial<ExecResult>[]) {
  const calls: string[] = []
  const run: Exec = async (command) => {
    calls.push(command)
    return { code: 0, output: "", timedOut: false, ...(outputs.shift() ?? {}) }
  }
  return { run, calls }
}

async function setup(outputs: Partial<ExecResult>[], requiresExists = true) {
  const f = createFakeHost()
  const dir = mkdtempSync(join(tmpdir(), "tony-diag-"))
  if (requiresExists) {
    mkdirSync(join(dir, "bin"))
    writeFileSync(join(dir, "bin", "check"), "")
  }
  f.sessions.set("s", { directory: dir })
  const exec = fakeExec(outputs)
  await registerDiagnostics(
    f.host,
    { enabled: true, timeoutMs: 1000, checkers: [{ extensions: [".ts"], command: "bin/check {file}", requires: "bin/check" }] },
    exec.run,
  )
  const edit = { tool: "edit", sessionID: "s", input: { path: "a.ts" } }
  return { f, exec, edit }
}

test("appends new errors to the edit result", async () => {
  const { f, edit } = await setup([{ output: "" }, { output: "a.ts(5,1): error TS2: new" }])
  await f.before(edit)
  await f.after({ ...edit, status: "completed", result: {} })
  expect(f.appended[0]).toContain("New problems after this edit:")
  expect(f.appended[0]).toContain("TS2")
})

test("nothing appended without new problems", async () => {
  const { f, edit } = await setup([{ output: "a.ts(1,1): error TS1: old" }, { output: "a.ts(3,1): error TS1: old" }])
  await f.before(edit)
  await f.after({ ...edit, status: "completed", result: {} })
  expect(f.appended).toEqual([])
})

test("unavailable checker is skipped", async () => {
  const { f, exec, edit } = await setup([], false)
  await f.before(edit)
  await f.after({ ...edit, status: "completed", result: {} })
  expect(exec.calls).toEqual([])
})

test("timeout is skipped", async () => {
  const { f, edit } = await setup([{ output: "" }, { output: "a.ts(5,1): error TS2: new", timedOut: true }])
  await f.before(edit)
  await f.after({ ...edit, status: "completed", result: {} })
  expect(f.appended).toEqual([])
})
