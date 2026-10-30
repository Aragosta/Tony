import { expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { newProblems, normalize } from "../src/core/diagnostics/diff.ts"
import { registerDiagnostics } from "../src/core/diagnostics/register.ts"
import type { Exec, ExecResult } from "../src/core/verify/exec.ts"
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

test("file paths are not shell-expanded", async () => {
  const f = createFakeHost()
  const dir = mkdtempSync(join(tmpdir(), "tony-diag-"))
  f.sessions.set("s", { directory: dir })
  await registerDiagnostics(f.host, { enabled: true, timeoutMs: 5000, checkers: [{ extensions: [".ts"], command: "echo {file}", requires: "echo" }] })
  const edit = { tool: "write", sessionID: "s", input: { path: "x$(touch PWNED)`touch PWNED2`'q.ts" } }
  await f.before(edit)
  await f.after({ ...edit, status: "completed", result: {} })
  expect(existsSync(join(dir, "PWNED")) || existsSync(join(dir, "PWNED2"))).toBe(false)
})

test("new problems in other files are reported", async () => {
  const { f, edit } = await setup([{ output: "" }, { output: "b.ts(5,1): error TS2554: Expected 2 arguments" }])
  await f.before(edit)
  await f.after({ ...edit, status: "completed", result: {} })
  expect(f.appended[0]).toContain("b.ts(5,1)")
})

test("a problem is reported once, not on every later edit", async () => {
  const { f, exec, edit } = await setup([{ output: "" }, { output: "a.ts(5,1): error TS2: new" }, { output: "a.ts(6,1): error TS2: new" }])
  for (let i = 0; i < 2; i++) {
    await f.before(edit)
    await f.after({ ...edit, status: "completed", result: {} })
  }
  expect(f.appended.length).toBe(1)
  expect(exec.calls.length).toBe(3)
})

test("a timeout turns the checker off for the session", async () => {
  const { f, exec, edit } = await setup([{ output: "" }, { timedOut: true }])
  for (let i = 0; i < 2; i++) {
    await f.before(edit)
    await f.after({ ...edit, status: "completed", result: {} })
  }
  expect(exec.calls.length).toBe(2)
})
