import { afterEach, beforeEach, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { registerGate } from "../src/core/gate/register.ts"
import { DEFAULTS, type GateOptions } from "../src/options.ts"
import type { Exec, ExecResult } from "../src/core/verify/exec.ts"
import { createFakeHost } from "./fake-host.ts"

let statusFile = ""
let savedStatus: string | undefined
beforeEach(() => {
  savedStatus = process.env.TONY_STATUS_FILE
  statusFile = join(mkdtempSync(join(tmpdir(), "tony-status-")), "status.jsonl")
  process.env.TONY_STATUS_FILE = statusFile
})
afterEach(() => {
  if (savedStatus === undefined) delete process.env.TONY_STATUS_FILE
  else process.env.TONY_STATUS_FILE = savedStatus
})
const statuses = () => (existsSync(statusFile) ? readFileSync(statusFile, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [])

async function setup(results: Partial<ExecResult>[] = [], opts: Partial<GateOptions> = {}, finalText = "Done.") {
  const f = createFakeHost()
  const dir = mkdtempSync(join(tmpdir(), "tony-gate-"))
  f.sessions.set("s", { directory: dir })
  f.transcripts.set("s", [
    { type: "user", text: "do it" },
    { type: "assistant", text: finalText, tools: [], files: [] },
  ])
  const calls: string[] = []
  const exec: Exec = async (command) => {
    calls.push(command)
    return { code: 0, output: "", timedOut: false, ...(results.shift() ?? {}) }
  }
  await registerGate(f.host, { ...DEFAULTS.gate, ...opts }, { exec, detect: () => ["bun test"] })
  return { f, calls }
}
const edit = (path = "a.ts") => ({ tool: "edit", sessionID: "s", input: { path }, status: "completed" as const, result: {} })

test("failing checks send the agent back once", async () => {
  const { f } = await setup([{ code: 1, output: "1 fail" }])
  await f.after(edit())
  await f.idle("s")
  expect(f.continued).toHaveLength(1)
  expect(f.continued[0]!.text).toContain("The project's checks fail:")
  expect(f.continued[0]!.text).toContain("1 fail")
  await f.idle("s")
  expect(f.continued).toHaveLength(1)
  expect(statuses().at(-1).status).toBe("unresolved")
})

test("verified when checks pass", async () => {
  const { f } = await setup([{ code: 0 }])
  await f.after(edit())
  await f.idle("s")
  expect(f.continued).toEqual([])
  expect(statuses().at(-1).status).toBe("verified")
})

test("checks run once per change", async () => {
  const { f, calls } = await setup([{ code: 0 }, { code: 0 }])
  await f.after(edit())
  await f.idle("s")
  await f.idle("s")
  expect(calls).toHaveLength(1)
})

test("no change, no check run", async () => {
  const { f, calls } = await setup()
  await f.idle("s")
  expect(calls).toEqual([])
  expect(statuses().at(-1).status).toBe("no-changes")
})

test("a failed edit is not a change", async () => {
  const { f, calls } = await setup()
  await f.after({ tool: "edit", sessionID: "s", input: { path: "a.ts" }, status: "error", error: { message: "no match" } })
  await f.idle("s")
  expect(calls).toEqual([])
})

test("files from opencode's snapshot count as changes", async () => {
  const { f, calls } = await setup()
  f.transcripts.set("s", [
    { type: "user", text: "do it" },
    { type: "assistant", text: "Done.", tools: ["shell"], files: ["a.ts"] },
  ])
  await f.idle("s")
  expect(calls).toEqual(["bun test"])
})

test("round cap stops the gate", async () => {
  const { f } = await setup([{ code: 1, output: "boom 1" }, { code: 1, output: "boom 2" }], { maxRounds: 1 })
  await f.after(edit())
  await f.idle("s")
  await f.after(edit("b.ts"))
  await f.idle("s")
  expect(f.continued).toHaveLength(1)
  expect(statuses().at(-1).status).toBe("unresolved")
})

test("a blocked answer is not sent back", async () => {
  const { f } = await setup([{ code: 1, output: "STATUS_URL missing" }], {}, "Blocked: STATUS_URL is not set")
  await f.after(edit())
  await f.idle("s")
  expect(f.continued).toEqual([])
  expect(statuses().at(-1).status).toBe("needs-user")
})

test("subagent sessions are ignored", async () => {
  const { f, calls } = await setup()
  f.sessions.set("child", { directory: process.cwd(), parentID: "s" })
  await f.idle("child")
  expect(calls).toEqual([])
  expect(f.continued).toEqual([])
  expect(statuses()).toEqual([])
})

test("background work defers the gate", async () => {
  const { f, calls } = await setup()
  await f.after(edit())
  await f.idle("s", [{ kind: "shell", sessionID: "s" }])
  expect(calls).toEqual([])
  expect(statuses()).toEqual([])
})

test("new prompt resets rounds", async () => {
  const { f } = await setup([{ code: 1, output: "x" }, { code: 1, output: "x" }])
  await f.after(edit())
  await f.idle("s")
  await f.prompt("s")
  await f.after(edit())
  await f.idle("s")
  expect(f.continued).toHaveLength(2)
})

test("gate errors never block", async () => {
  const { f } = await setup()
  f.host.transcript = async () => {
    throw new Error("boom")
  }
  await f.after(edit())
  await f.idle("s")
  expect(f.continued).toEqual([])
})

test("disabled registers nothing", async () => {
  const { f, calls } = await setup([], { enabled: false })
  await f.after(edit())
  await f.idle("s")
  expect(calls).toEqual([])
})
